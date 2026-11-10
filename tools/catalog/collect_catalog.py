#!/usr/bin/env python3
"""Four-chain catalog MVP. Python 3.10+, stdlib only. See catalog_collector_README.md.

Reuses the verified HTTP client / JSON category parsers from audit_store_categories
and SEVEN classification / gift exclusion / CSV writer from final_seven_collector.
Existing collectors and backend CSVs are never overwritten.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import html
import json
import logging
from pathlib import Path
import re
import sqlite3
import sys
from typing import Any
from urllib.parse import urljoin

import audit_store_categories as audit
import final_seven_collector as seven
from catalog_normalization import normalize_name
from catalog_paths import ARTIFACT_ROOT, NAME_REPORT, REFERENCE_OUTPUT, REPO_ROOT

BRANDS = ('SEVEN', 'GS25', 'EMART24', 'CU')
QUERIES = list(dict.fromkeys(seven.QUERIES + ['봉지라면', '참치마요', '제육', '불고기']))
REPORT_COLS = ['brand', 'source_code', 'source_name', 'normalized_name', 'category',
               'list_price', 'event', 'raw_category', 'reason']


def digest(value: str, length: int = 32) -> str:
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:length]


def price(value: Any) -> int:
    if value is None or isinstance(value, bool):
        raise ValueError('missing price')
    try:
        number = Decimal(str(value).replace(',', '').strip())
    except InvalidOperation as exc:
        raise ValueError(f'invalid price: {value!r}') from exc
    if not number.is_finite() or number != number.to_integral_value() or not 0 < number <= 2147483647:
        raise ValueError(f'invalid price: {value!r}')
    return int(number)


def event(value: Any) -> str:
    raw = re.sub(r'\s+', '', audit.single(value)).upper()
    if raw in seven.VALID_EVENTS:
        return raw
    return seven.EVENT_MAP.get(raw, 'OTHER')


def record(brand, code, name, amount, promotion, c1='', c2='', c3='', image='', event_origin='response'):
    return dict(brand=brand, source_code=audit.single(code), source_name=audit.single(name),
                price=amount, event=event(promotion), raw_event=audit.single(promotion),
                c1=audit.single(c1), c2=audit.single(c2), c3=audit.single(c3),
                image_url=audit.single(image), event_origin=event_origin)


def parse_seven(payload: Any) -> list[dict]:
    rows = []
    for f in audit.search_documents(payload, 'offline'):
        if not all(k in f for k in seven.REQUIRED):
            raise audit.AuditError('SEVEN required price/name/category/event fields missing')
        rows.append(record('SEVEN', f['itemCd'], f['itemOnm'], f['onlinePrice'], f['evnMnmNm'],
                           f['dispClassNm'], image=f.get('repImgUrl') or f.get('repImgPath', '')))
    return rows


def parse_gs25(payload: Any) -> tuple[list[dict], list[dict]]:
    rows = []
    for f in audit.search_documents(payload, 'offlineItem'):
        if not all(k in f for k in ('itemCode', 'itemName', 'sellPrice', 'dptNm', 'lineNm', 'clssNm')):
            raise audit.AuditError('GS25 required fields missing')
        rows.append(record('GS25', f['itemCode'], f['itemName'], f['sellPrice'], 'OTHER',
                           f['dptNm'], f['lineNm'], f['clssNm'], f.get('itemImageFileName', ''),
                           'unverified_no_oneplus_match'))
    promotions = []
    # oneplus is an independent collection, not the offlineItem eventTag field.
    for f in audit.search_documents(payload, 'oneplus'):
        if audit.single(f.get('tag')) == '1':
            promotions.append(record('GS25', f['itemCode'], f['itemName'], f['sellPrice'], '1+1',
                f.get('categoryLargeName', ''), f.get('categoryMediumName', ''), f.get('categorySmallName', ''),
                f.get('itemImageUrl', ''), 'oneplus_tag_1'))
    return rows, promotions


def parse_emart24(payload: Any) -> list[dict]:
    rows = []
    for f in audit.emart_products(payload):
        if not all(k in f for k in ('pluCd', 'goodsNm', 'viewPrice')):
            raise audit.AuditError('EMART24 required price/event fields missing')
        origin = f.get('originPrice')
        try:
            amount = price(origin)
        except ValueError:
            # Documented zero / absent original price uses displayed price; negative salePrice is not a price.
            if origin not in (None, '', 0, '0'):
                raise audit.AuditError(f'EMART24 invalid originPrice: {origin!r}')
            amount = f['viewPrice']
        rows.append(record('EMART24', f['pluCd'], f['goodsNm'], amount, f.get('title'),
                           f.get('gdsMclssNm', ''), f.get('gdsSclssNm', '')))
    return rows


def parse_cu(content: str, payload: dict) -> list[dict]:
    # Keep audit's no-results / category validation; add SKU, price and promotion parsing.
    main, sub = str(payload.get('searchMainCategory', '')), str(payload.get('searchSubCategory', ''))
    items, ended = audit.parse_cu_page(content, main, sub, '')
    if ended:
        return []
    starts = list(audit.CU_CARD_RE.finditer(content))
    rows = []
    for i, item in enumerate(items):
        fragment = content[starts[i].start():starts[i + 1].start() if i + 1 < len(starts) else len(content)]
        fragment = re.sub(r'<!--.*?-->', '', fragment, flags=re.S)
        amount = re.search(r'<strong[^>]*>\s*([\d,]+)\s*</strong>', fragment, re.I)
        if not amount:
            raise audit.AuditError('CU card has no recognizable price')
        view = re.search(r'\bview\((\d+)\)', fragment)
        img = audit.CU_IMG_RE.search(fragment)
        image = html.unescape(img[2]) if img else ''
        code = 'view-' + view[1] if view else item.code
        # Only explicit badge contents are promotions. Comments describe all possible badges.
        badge = re.search(r'<div\s+class=["\']badge["\'][^>]*>(.*?)</div>', fragment, re.I | re.S)
        promotion = html.unescape(audit.STRIP_TAG_RE.sub('', badge[1])).strip() if badge else ''
        rows.append(record('CU', code, item.name, amount[1], promotion,
                           item.c1, item.c2, '', urljoin('https://cu.bgfretail.com/', image)))
    return rows


def parse_response(brand: str, body: str, payload: dict):
    if brand == 'CU':
        return parse_cu(body, payload), []
    data = json.loads(body)
    if brand == 'SEVEN':
        if data.get('success') is False:
            raise audit.AuditError('SEVEN returned success=false')
        return parse_seven(data), []
    if brand == 'GS25':
        return parse_gs25(data)
    return parse_emart24(data), []


def gather(out: Path, args) -> tuple[list[dict], dict]:
    rows, promos = [], []
    reports = {b: dict(status='not_started', received=0, duplicate=0, errors=[], truncated=[], pages=0) for b in BRANDS}
    if args.input_jsonl:
        for saved_path in args.input_jsonl:
            with saved_path.open(encoding='utf-8-sig') as file:
                for envelope in (json.loads(line) for line in file if line.strip()):
                    brand = envelope['brand']
                    if brand not in BRANDS:
                        raise ValueError('unknown saved-response brand')
                    try:
                        batch, promotions = parse_response(brand, envelope['body'], envelope['request'])
                        rows.extend(batch); promos.extend(promotions)
                        reports[brand]['received'] += len(batch)
                        reports[brand]['pages'] += 1
                        reports[brand]['status'] = 'offline_replay'
                    except (audit.AuditError, ValueError, KeyError) as exc:
                        reports[brand]['errors'].append(str(exc))
        # Snapshots are reusable data, not proof that a full online scan reached its end.
    else:
        client = audit.Client(args.timeout, args.delay, args.max_requests, 'PyeonriCatalogCollector/1.0')
        with (out / 'raw_responses.jsonl').open('x', encoding='utf-8') as saved:
            for brand in args.brands:
                report = reports[brand]
                report['status'] = 'success'
                scopes = audit.CU_MENUS if brand == 'CU' else [(q, '', '') for q in args.queries]
                try:
                    for scope, sub, _ in scopes:
                        seen_pages = set()
                        for page in range(args.max_pages):
                            if brand == 'SEVEN':
                                payload = dict(collection='goods', query=scope, sort='quantity/desc,itemOnm/asc', startCount=page, listCount=100)
                            elif brand == 'GS25':
                                # Live-verified: offset, not page index (0, 50, 100, ...).
                                payload = dict(query=scope, startCount=page * 50, listCount=50)
                            elif brand == 'EMART24':
                                payload = dict(currentPage=page + 1, pageCnt=10, sortType='SALE', saleProductYn='N', searchWord=scope)
                            else:
                                payload = dict(pageIndex=page + 1, searchMainCategory=scope, searchSubCategory=sub,
                                    listType=1, searchCondition='setA', searchUseYn='N', gdIdx=0, codeParent=scope, user_id='')
                            body = client.post(brand.lower(), payload, json_body=brand in ('SEVEN', 'GS25')).decode('utf-8-sig')
                            saved.write(json.dumps(dict(brand=brand, request=payload, body=body), ensure_ascii=False) + '\n')
                            saved.flush()
                            batch, promotions = parse_response(brand, body, payload)
                            report['pages'] += 1
                            report['received'] += len(batch)
                            stamp = digest(json.dumps([batch, promotions], sort_keys=True, ensure_ascii=False))
                            if not batch and not promotions:
                                break
                            if stamp in seen_pages:
                                report['truncated'].append(f'{scope}/{sub}: repeated page at {page + 1}')
                                break
                            seen_pages.add(stamp)
                            rows.extend(batch); promos.extend(promotions)
                            logging.info('%s %s/%s page=%s rows=%s', brand, scope, sub, page + 1, len(batch))
                        else:
                            report['truncated'].append(f'{scope}/{sub}: max-pages={args.max_pages}')
                except (audit.AuditError, ValueError, KeyError, OSError) as exc:
                    report['errors'].append(str(exc))
                    logging.error('%s stopped; preserving received products: %s', brand, exc)
    # All queries must finish before deciding which GS25 products have confirmed 1+1.
    promo_names = {(r['source_code'], normalize_name(r['source_name'])[2]) for r in promos}
    for row in rows:
        if row['brand'] == 'GS25' and (row['source_code'], normalize_name(row['source_name'])[2]) in promo_names:
            row['event'] = 'ONE_PLUS_ONE'
            row['event_origin'] = 'oneplus_tag_1'
    rows.extend(promos)
    unique = {}
    for row in rows:
        # Include price/event/category in signature: inconsistent copies must reach conflict detection.
        signature = json.dumps({k: v for k, v in row.items() if k not in ('image_url', 'raw_event')}, sort_keys=True, ensure_ascii=False)
        if signature in unique:
            reports[row['brand']]['duplicate'] += 1
        else:
            unique[signature] = row
    for brand, report in reports.items():
        report['promotion_rows'] = sum(row['brand'] == brand for row in promos)
        count = sum(row['brand'] == brand for row in unique.values())
        report['unique_source_rows'] = count
        if report['errors']:
            report['status'] = 'partial' if count else 'failed'
        elif report['truncated']:
            report['status'] = 'partial'
        elif report['status'] == 'success' and not count:
            report['status'] = 'empty'
    return list(unique.values()), reports


def source_category(row: dict) -> str:
    # A specific leaf takes precedence over GS25's broader '유제품/우유' parents.
    # '커피/차' alone is ambiguous; coffee-flavored candy is not coffee.
    if row['brand'] == 'GS25':
        leaf = row['c3'].replace(' ', '')
        if row['c1'] in ('유제품', '음료', '일반식품', 'FreshFood') and (
                leaf in ('냉장커피', '원두커피', '커피믹스') or leaf.startswith(('커피음료-', '원두커피-'))):
            return 'COFFEE'
        if '커피/차' in row['c2']:
            return ''
    cat = seven.classify(row['brand'], row['c1'], row['c2'], row['c3'], row['source_name'])
    # GS25 also uses upper-case FRESH FOOD and categoryLargeName in oneplus.
    if not cat and row['brand'] == 'GS25':
        c1 = 'FreshFood' if row['c1'].replace(' ', '').upper() == 'FRESHFOOD' else row['c1']
        cat = seven.classify('GS25', c1, row['c2'], row['c3'], row['source_name'])
    return cat


def fallback_category(row: dict) -> str:
    name = row['source_name'].replace(' ', '')
    raw = (row['c1'] + row['c2'] + row['c3']).replace(' ', '')
    # A contradicting detailed taxonomy wins over a keyword (콜라맛 젤리 etc.).
    if re.search(r'과자|젤리|캔디|껌|초콜릿|생활|잡화|샐러드|빵|치즈|버터|아이스크림', raw + name):
        return ''
    if re.search(r'도시락김|라면과자|콜라겐|쇼콜라|삼각팬티|스낵', name):
        return ''
    if re.search(r'^도\)|도시락', name):
        return 'LUNCHBOX'
    if re.search(r'^삼\)|^삼각\)|삼각김밥|삼각$', name):
        return 'TRIANGLE_KIMBAP'
    if re.search(r'라면|사발면|큰사발|소컵|큰컵', name):
        if '봉지' in name:
            return 'RAMEN_BAG'
        if re.search(r'소컵|큰컵|컵라면|큰사발|사발면', name):
            return 'RAMEN_CUP'
    if re.search(r'음료|메뉴:60', raw) and re.search(r'코카콜라|펩시콜라', name):
        return 'COLA'
    if re.search(r'유제품|우유|메뉴:60', raw) and '우유' in name:
        return 'MILK'
    if re.search(r'음료|커피|메뉴:60', raw) and re.search(r'커피|카페라떼|아메리카노', name):
        return 'COFFEE'
    return ''


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file))


def integrate(raw: list[dict], samples: Path | None = None, names: Path | None = None):
    category_index = defaultdict(set)
    sample_rows = []
    if samples:
        for s in read_csv(samples):
            sample_rows.append(record(s['brand'], s['source_code'], s['name'], None, '',
                                     s['raw_category_1'], s['raw_category_2'], s['raw_category_3']))
    for row in raw + sample_rows:
        cat = source_category(row)
        if cat:
            category_index[normalize_name(row['source_name'], cat)[2]].add(cat)
    excluded, unmapped, conflicts, prepared = [], [], [], []
    for original in raw:
        row = dict(original)
        row.update(normalized_name='', category='', list_price='', raw_category='/'.join([row['c1'], row['c2'], row['c3']]))
        if seven.explicitly_gift_only(row['source_name']):
            row['reason'] = 'explicit gift-only SKU'; excluded.append(row); continue
        cat = source_category(row)
        if not cat:
            candidates = set()
            for hint in ('', 'LUNCHBOX', 'TRIANGLE_KIMBAP'):
                values = category_index.get(normalize_name(row['source_name'], hint)[2], set())
                candidates.update(value for value in values if not hint or value == hint)
            if len(candidates) == 1:
                cat = next(iter(candidates))
                row['category_origin'] = 'same_normalized_name'
            elif len(candidates) > 1:
                row['reason'] = 'ambiguous same-name categories'; conflicts.append(row); continue
            else:
                cat = fallback_category(row)
                row['category_origin'] = 'conservative_name_fallback'
        else:
            row['category_origin'] = 'source_taxonomy'
        name, maker, identity, size, unit = normalize_name(row['source_name'], cat)
        row.update(normalized_name=name, name=name, maker=maker, identity=identity, size=size,
                   unit=unit, category=cat)
        if not cat:
            row['reason'] = 'unmapped category'; unmapped.append(row); continue
        try:
            amount = price(row['price'])
            row['list_price'] = str(amount)
            if not row['source_code'] or not row['source_name']:
                raise ValueError('missing source SKU or name')
            if not name or len(name) > 100 or len(maker) > 40 or len(row['source_name']) > 100:
                raise ValueError('DB name/maker/source_name length exceeded')
            if row['image_url'] and (len(row['image_url']) > 300 or not row['image_url'].startswith(('https://', 'http://'))):
                row['image_url'] = ''
            if any('\n' in str(value) or '\r' in str(value) for value in row.values()):
                raise ValueError('multiline field unsupported by ProductCsvLoader')
        except ValueError as exc:
            row['reason'] = str(exc); excluded.append(row); continue
        prepared.append(row)
    by_name = defaultdict(list)
    for row in prepared:
        by_name[row['identity']].append(row)
    groups, products = [], []
    keys, ids = {}, {}
    for identity, batch in sorted(by_name.items()):
        attrs = {(r['category'], r['size'], r['unit']) for r in batch}
        if len(attrs) > 1:
            for row in batch:
                conflicts.append(dict(row, reason='same normalized name, conflicting category/size/unit'))
            continue
        group_key = 'p-' + digest(identity)
        if group_key in keys and keys[group_key] != identity:
            raise ValueError(f'product_key hash collision: {group_key}')
        keys[group_key] = identity
        good = []
        for brand in BRANDS:
            brand_rows = [row for row in batch if row['brand'] == brand]
            if not brand_rows:
                continue
            if len({(r['list_price'], r['event']) for r in brand_rows}) > 1:
                for row in brand_rows:
                    conflicts.append(dict(row, reason='same brand/product has conflicting price or event'))
                continue
            chosen = min(brand_rows, key=lambda r: (r['source_code'], r['source_name']))
            pid = brand.lower() + '-' + digest(chosen['source_code'] + '\0' + identity, 28)
            if pid in ids and ids[pid] != (brand, chosen['source_code'], identity):
                raise ValueError(f'product_id hash collision: {pid}')
            ids[pid] = brand, chosen['source_code'], identity
            products.append(dict(product_id=pid, product_key=group_key, brand=brand,
                                 source_name=chosen['source_name'], list_price=chosen['list_price'], event=chosen['event']))
            good.extend(brand_rows)
        if good:
            representative = min(good, key=lambda r: (r['size'] is None, BRANDS.index(r['brand']), r['name']))
            image = next((r['image_url'] for r in sorted(good, key=lambda r: BRANDS.index(r['brand'])) if r['image_url']), '')
            groups.append(dict(product_key=group_key, name=representative['name'], maker=representative['maker'],
                category=representative['category'], size=str(representative['size'] or ''),
                unit=representative['unit'] or '', image_url=image))
    # Existing output differences are an audit only; no barcode-driven forced aliases.
    differences = []
    if names:
        for old in read_csv(names):
            for candidate in old.get('candidates', '').split(' | '):
                if ':' not in candidate:
                    continue
                brand, raw_name = candidate.split(':', 1)
                hits = [r for r in prepared if r['brand'] == brand and r['source_name'] == raw_name]
                normalized = hits[0]['name'] if hits else normalize_name(raw_name)[0]
                if normalized != old['name']:
                    differences.append(dict(brand=brand, source_name=raw_name, previous_name=old['name'],
                        normalized_name=normalized, reason='team v1.0 rules applied; reference is not an alias'))
    return groups, products, dict(sku_conflicts=conflicts, unmapped_products=unmapped,
        excluded_items=excluded, normalization_changes=differences, prepared=prepared)


def validate_output(groups: list[dict], products: list[dict], schema: Path):
    keys, ids, pairs = set(), set(), set()
    for row in groups:
        key = row['product_key']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', key) or len(key) > 60 or key in keys:
            raise ValueError('invalid/duplicate product_key')
        keys.add(key)
        if not row['name'] or len(row['name']) > 100 or len(row['maker']) > 40 or len(row['image_url']) > 300:
            raise ValueError('group column length violation')
        if row['category'] not in seven.VALID_CATEGORIES or bool(row['size']) != bool(row['unit']):
            raise ValueError('invalid category/size/unit')
        if row['size'] and (not 0 < int(row['size']) <= 2147483647 or row['unit'] not in ('ML', 'G')):
            raise ValueError('invalid size/unit')
    for row in products:
        pair = row['product_key'], row['brand']
        if row['product_id'] in ids or pair in pairs or row['product_key'] not in keys:
            raise ValueError('PK/UNIQUE/FK violation')
        ids.add(row['product_id']); pairs.add(pair)
        if row['brand'] not in BRANDS or len(row['product_id']) > 40 or not row['product_id'].startswith(row['brand'].lower() + '-'):
            raise ValueError('invalid product brand/id')
        if row['event'] not in seven.VALID_EVENTS or len(row['source_name']) > 100 or not row['source_name']:
            raise ValueError('invalid event/source_name')
        price(row['list_price'])
    # Execute the actual product-table constraints using SQLite; translate only H2 REGEXP_LIKE.
    sql = schema.read_text(encoding='utf-8-sig')
    db = sqlite3.connect(':memory:')
    try:
        db.execute('PRAGMA foreign_keys=ON')
        db.create_function('REGEXP_LIKE', 2, lambda value, pattern: re.search(pattern, value) is not None)
        for table, rows, cols in [('product_group', groups, seven.GROUP_COLS), ('product', products, seven.PRODUCT_COLS)]:
            match = re.search(r'CREATE TABLE ' + table + r'\s*\(.*?\n\);', sql, re.S)
            if not match:
                raise ValueError(f'schema table not found: {table}')
            db.execute(match[0])
            for row in rows:
                values = [row[c] if row[c] != '' else None for c in cols]
                db.execute(f'INSERT INTO {table} ({",".join(cols)}) VALUES ({",".join("?" for _ in cols)})', values)
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('foreign key check failed')
    finally:
        db.close()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out-dir', type=Path, default=ARTIFACT_ROOT / ('catalog_output_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')))
    ap.add_argument('--input-jsonl', type=Path, action='append', help='offline replay of raw_responses.jsonl (repeat for multiple runs)')
    ap.add_argument('--brands', nargs='+', choices=BRANDS, default=list(BRANDS), help='default: all four chains; select one for recovery')
    ap.add_argument('--category-samples', type=Path, default=REFERENCE_OUTPUT / 'category_audit_output/product_samples.csv')
    ap.add_argument('--name-report', type=Path, default=NAME_REPORT)
    ap.add_argument('--previous-csv-dir', type=Path, action='append', help='compare existing names only; repeat for multiple CSV directories')
    ap.add_argument('--query', action='append', dest='queries')
    ap.add_argument('--max-pages', type=int, default=50)
    ap.add_argument('--max-requests', type=int, default=1200)
    ap.add_argument('--delay', type=float, default=1.2)
    ap.add_argument('--timeout', type=float, default=15)
    args = ap.parse_args(argv)
    if args.max_pages < 1 or args.max_requests < 1 or args.delay < 1 or args.timeout <= 0:
        ap.error('max-pages/max-requests >= 1, delay >= 1s, timeout > 0 required')
    args.queries = list(dict.fromkeys(args.queries or QUERIES))
    out = args.out_dir.resolve()
    if out.exists():
        ap.error('output directory exists; choose a NEW --out-dir (existing data is never overwritten)')
    for path in (args.input_jsonl or []) + [args.name_report]:
        if path and not path.is_file():
            ap.error(f'input missing: {path}')
    out.mkdir(parents=True)
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    report = dict(generated_at_utc=datetime.now(timezone.utc).isoformat(), source='offline' if args.input_jsonl else 'live',
        endpoints={b.upper(): url for b, url in audit.URLS.items()}, scope='Search sampling, not complete catalogs; no store inventory collected')
    if args.input_jsonl:
        report['source_response_files'] = [str(path.resolve()) for path in args.input_jsonl]
    try:
        raw, brands = gather(out, args)
        report['brands'] = brands
        groups, products, artifacts = integrate(raw, args.category_samples if args.category_samples.is_file() else None, args.name_report)
        # Existing CSV is evidence for a difference report, never a source of invented prices or forced matches.
        previous_dirs = args.previous_csv_dir or [REFERENCE_OUTPUT / 'seven_csv_output', REPO_ROOT / 'backend/src/main/resources/data']
        new_names = {(r['brand'], r['source_name']): r['name'] for r in artifacts['prepared']}
        for previous in previous_dirs:
            if not (previous / 'product_group.csv').is_file() or not (previous / 'products.csv').is_file():
                continue
            old_groups = {r['product_key']: r['name'] for r in read_csv(previous / 'product_group.csv')}
            for old in read_csv(previous / 'products.csv'):
                normalized = new_names.get((old['brand'], old['source_name']))
                old_name = old_groups.get(old['product_key'])
                if normalized and old_name and normalized != old_name:
                    artifacts['normalization_changes'].append(dict(brand=old['brand'], source_name=old['source_name'],
                        previous_name=old_name, normalized_name=normalized, reason=f'existing CSV comparison: {previous}'))
        for name in ('sku_conflicts', 'unmapped_products', 'excluded_items'):
            seven.write_csv(out / (name + '.csv'), REPORT_COLS, [{k: str(r.get(k, '')) for k in REPORT_COLS} for r in artifacts[name]])
        seven.write_csv(out / 'normalization_changes.csv', ['brand', 'source_name', 'previous_name', 'normalized_name', 'reason'], artifacts['normalization_changes'])
        for brand in BRANDS:
            br = brands[brand]
            br.update(exported=sum(p['brand'] == brand for p in products),
                excluded=sum(p['brand'] == brand for p in artifacts['excluded_items']),
                unmapped=sum(p['brand'] == brand for p in artifacts['unmapped_products']),
                conflict_rows=sum(p['brand'] == brand for p in artifacts['sku_conflicts']),
                unverified_event_rows=sum(p['brand'] == brand and p['event_origin'] == 'unverified_no_oneplus_match' for p in artifacts['prepared']))
        report.update(groups=len(groups), products=len(products), normalization_changes=len(artifacts['normalization_changes']),
            notes=['OTHER is not NONE; no promotion discount is calculated.',
                'GS25 without a matching oneplus entry is OTHER (unverified promotion).',
                'CU SKU uses view(id); image barcode is not required.',
                'Reference categories are matched by normalized name, never barcode alone.'])
        validate_output(groups, products, REPO_ROOT / 'backend/src/main/resources/schema.sql')
        if not products:
            raise ValueError('no exportable products; reports and saved responses retained, no final CSV generated')
        seven.write_csv(out / 'product_group.csv', seven.GROUP_COLS, groups)
        seven.write_csv(out / 'products.csv', seven.PRODUCT_COLS, products)
        report['validation'] = 'passed: columns, lengths, enums, PK, FK, UNIQUE and actual schema CHECKs'
        print(json.dumps(dict(output=str(out), groups=len(groups), products=len(products), brands=brands), ensure_ascii=False, indent=2))
        selected = BRANDS if args.input_jsonl else args.brands
        return 0 if all(brands[b]['status'] in ('success', 'offline_replay') for b in selected) else 2
    except (ValueError, OSError, audit.AuditError, sqlite3.DatabaseError) as exc:
        report['fatal_error'] = str(exc)
        logging.error('%s (reports preserved in %s)', exc, out)
        return 1
    finally:
        (out / 'collection_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
