#!/usr/bin/env python3
"""SEVEN goods -> schema v1.3 CSV, with cross-store category recovery and SKU conflict audit.

Python 3.10+, stdlib only. Public, unofficial product search endpoint; no login bypass.
This is a SEVEN-only export, not a complete 4-brand merge.

Run:
  py -3 tools/catalog/final_seven_collector.py

Offline test:
  py -3 tools/catalog/final_seven_collector.py --input-json saved_response.json
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import logging
from pathlib import Path
import re
import sys
import tempfile
import time
import unicodedata
from typing import Any
from catalog_paths import ARTIFACT_ROOT, NAME_REPORT, REFERENCE_OUTPUT
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LOG = logging.getLogger('seven_final')
ENDPOINT = 'https://new.7-elevenapp.co.kr/api/v1/open/search/goods'
QUERIES = ['콜라', '코카콜라', '펩시', '큰사발', '컵라면', '라면', '도시락', '삼각', '우유', '바나나우유', '커피']
GROUP_COLS = ['product_key', 'name', 'maker', 'category', 'size', 'unit', 'image_url']
PRODUCT_COLS = ['product_id', 'product_key', 'brand', 'source_name', 'list_price', 'event']
SKU_COLS = ['normalized_name', 'category', 'source_code', 'source_name', 'list_price', 'event',
            'raw_category', 'decision', 'reason']
EXCLUDED_COLS = ['source_code', 'source_name', 'raw_category', 'normalized_name', 'reason']
CONFLICT_COLS = ['normalized_name', 'source_codes', 'prices', 'events', 'categories', 'reason']
VALID_EVENTS = {'NONE', 'ONE_PLUS_ONE', 'TWO_PLUS_ONE', 'THREE_PLUS_ONE', 'OTHER'}
VALID_CATEGORIES = {'COLA', 'RAMEN_CUP', 'RAMEN_BAG', 'LUNCHBOX', 'TRIANGLE_KIMBAP', 'MILK', 'COFFEE'}
EVENT_MAP = {'': 'NONE', '1+1': 'ONE_PLUS_ONE', '2+1': 'TWO_PLUS_ONE', '3+1': 'THREE_PLUS_ONE',
             '0+1': 'OTHER', '1+0': 'OTHER', '2+0': 'OTHER', '3+0': 'OTHER'}
MAKER_ALIASES = {'칠성': '롯데', '롯데칠성': '롯데', '비알': '배스킨라빈스', 'BR': '배스킨라빈스',
                 '코카': '코카콜라', '서울': '서울우유', '서울우유': '서울우유'}
NON_MAKERS = {'도', '삼', 'PB', 'Y', 'G', 'NEW', 'ALLNEW', '행사', '증정', 'M_증정'}
COLA_RX = re.compile(r'콜라|코크|펩시', re.I)
COLA_EXCLUDE_RX = re.compile(r'쇼콜라|콜라겐|니콜라|리콜라', re.I)
PREFIX_RX = re.compile(r'^([^\s()（）]{1,22})[)）]\s*(.*)$')
SIZE_RX = re.compile(r'(?<!\d)(\d+(?:\.\d+)?)\s*(ml|l|g)(?![a-z])', re.I)
REQUIRED = ('itemCd', 'itemOnm', 'onlinePrice', 'evnMnmNm', 'dispClassNm')


class CollectorError(RuntimeError):
    pass


@dataclass(frozen=True)
class Product:
    code: str
    source_name: str
    name: str
    maker: str
    identity: str
    raw_category: str
    category: str
    price: int
    event: str
    size: int | None
    unit: str | None
    category_origin: str


def text(value: Any) -> str:
    return re.sub(r'\s+', ' ', str(value if value is not None else '')).strip()


def naturalize(value: str) -> str:
    """Normalize typography, not semantic product variants."""
    s = unicodedata.normalize('NFKC', text(value))
    # Unicode middle dots are sometimes used instead of decimal point: 1ㆍ5L -> 1.5L.
    s = re.sub(r'(?<=\d)[ㆍ·ᆞ](?=\d)', '.', s)
    s = s.replace('_', ' ')
    s = re.sub(r'\[(?:D\d+|d\d+)\]', '', s)
    s = re.sub(r'(?<!\w)[12]편(?!\w)|[12]편$', '', s)
    s = re.sub(r'\bPET\b|펫', '', s, flags=re.I)
    # Package-size spellings from team naming rules; do not convert bare P labels.
    s = re.sub(r'(?<!\w)(\d+(?:\.\d+)?)P\b', lambda m:
               f'{m.group(1)}L' if '.' in m.group(1) else f'{m.group(1)}ml', s, flags=re.I)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def explicitly_gift_only(source_name: str) -> bool:
    """Do NOT exclude normal products with '키링증정' / gift-with-purchase labels."""
    s = naturalize(source_name)
    return bool(re.search(r'\(\s*증정용\s*\)|^\s*(?:M[_ ]?)?증정[)）:]|^\s*증정용[)）:]', s, re.I))


def normalize_product(raw_name: str, category_hint: str = '') -> tuple[str, str, str, int | None, str | None]:
    s = naturalize(raw_name)
    maker = ''
    m = PREFIX_RX.match(s)
    if m:
        prefix, body = m.group(1), m.group(2).strip()
        if category_hint not in ('LUNCHBOX', 'TRIANGLE_KIMBAP'):
            cleaned_prefix = re.sub(r'\W+', '', prefix).upper()
            if cleaned_prefix not in NON_MAKERS and not prefix.startswith(('도', '삼')):
                maker = MAKER_ALIASES.get(prefix, prefix)
        s = body or s
    if category_hint in ('LUNCHBOX', 'TRIANGLE_KIMBAP'):
        maker = ''
    # Preserve model and flavors; remove only packaging terms specified by team.
    s = naturalize(s)
    if maker and not s.casefold().startswith(maker.casefold()):
        display = f'{maker} {s}'
    else:
        display = s
    display = re.sub(r'\s+', ' ', display).strip()
    # Identity is based on normalized name, *not* barcode. Different barcode + same name -> one group.
    # Identical barcode + different names -> different groups; don't auto-merge by barcode.
    identity = re.sub(r'\s+', '', display).casefold()
    matches = list(SIZE_RX.finditer(display))
    size, unit = None, None
    if matches:
        match = matches[-1]
        amount = Decimal(match.group(1))
        unit = match.group(2).upper()
        if unit == 'L':
            amount *= 1000
            unit = 'ML'
        if amount > 0 and amount == amount.to_integral_value():
            size = int(amount)
        else:
            unit = None
    return display, maker, identity, size, unit


def classify(brand: str, c1: str, c2: str, c3: str, name: str) -> str:
    """Only map a category if source taxonomy strongly supports it."""
    a, b, c = (naturalize(x).replace(' ', '') for x in (c1, c2, c3))
    compact = naturalize(name).replace(' ', '')
    if brand == 'SEVEN':
        if a in ('컵라면', '용기면'):
            return 'RAMEN_CUP'
        if a == '봉지라면':
            return 'RAMEN_BAG'
        if a == '도시락':
            return 'LUNCHBOX'
        if a == '삼각김밥':
            return 'TRIANGLE_KIMBAP'
        if a == '탄산음료' and COLA_RX.search(compact) and not COLA_EXCLUDE_RX.search(compact):
            return 'COLA'
        if a in ('우유', '흰우유', '가공유', '유제품') and '우유' in compact:
            return 'MILK'
        if a in ('커피', '커피음료', '액상커피'):
            return 'COFFEE'
        if a == '파우치음료' and ('커피' in compact or '칸타타' in compact):
            return 'COFFEE'
    elif brand == 'EMART24':
        if a == '면식품' and b.startswith('용기면'):
            return 'RAMEN_CUP'
        if a == '면식품' and b == '봉지면':
            return 'RAMEN_BAG'
        if a == '도시락':
            return 'LUNCHBOX'
        if a == '주먹밥' and b in ('더큰삼각', '일반삼각'):
            return 'TRIANGLE_KIMBAP'
        if a == '탄산음료' and COLA_RX.search(compact) and not COLA_EXCLUDE_RX.search(compact):
            return 'COLA'
        if a == '우유':
            return 'MILK'
        if a == '냉장커피' or (a == '파우치음료' and b == '커피파우치'):
            return 'COFFEE'
    elif brand == 'GS25':
        if a == '일반식품' and b == '면류' and c.startswith('용기면'):
            return 'RAMEN_CUP'
        if a == '일반식품' and b == '면류' and c == '봉지면':
            return 'RAMEN_BAG'
        if a == 'FreshFood' and b == '도시락':
            return 'LUNCHBOX'
        if a == 'FreshFood' and b == '주먹밥' and c == '삼각김밥':
            return 'TRIANGLE_KIMBAP'
        if a == '음료' and b == '탄산음료' and COLA_RX.search(compact) and not COLA_EXCLUDE_RX.search(compact):
            return 'COLA'
        if a == '유제품' and b == '우유':
            return 'MILK'
        if a == '음료' and '커피' in b:
            return 'COFFEE'
    elif brand == 'CU':
        # CU menu classifications are broader than final category; only trust explicit name cues.
        if a == '메뉴:10' and b == '소분류:1' and ('도시락' in compact or compact.startswith('도)')):
            return 'LUNCHBOX'
        if a == '메뉴:10' and b == '소분류:2' and ('삼각' in compact or compact.startswith('삼)')):
            return 'TRIANGLE_KIMBAP'
    return ''


def normalize_with_category(raw_name: str, category: str) -> tuple[str, str, str, int | None, str | None]:
    """First normalize by known category so factory prefixes on fresh foods disappear."""
    return normalize_product(raw_name, category)


def read_category_samples(path: Path | None) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    by_name: dict[str, set[str]] = defaultdict(set)
    by_barcode_name: dict[str, set[str]] = defaultdict(set)
    if path is None:
        return by_name, by_barcode_name
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        needed = {'brand', 'source_code', 'name', 'raw_category_1', 'raw_category_2', 'raw_category_3'}
        if not needed.issubset(reader.fieldnames or []):
            raise CollectorError(f'category samples missing columns: {sorted(needed - set(reader.fieldnames or []))}')
        for row in reader:
            brand = text(row['brand'])
            cat = classify(brand, row['raw_category_1'], row['raw_category_2'], row['raw_category_3'], row['name'])
            name_key = normalize_product(row['name'], cat)[2]
            code = text(row['source_code'])
            if code:
                by_barcode_name[code].add(name_key)
            if cat:
                by_name[name_key].add(cat)
    return by_name, by_barcode_name


def read_name_report(path: Path | None) -> dict[str, str]:
    """Use team-preferred display names only where its canonical spelling is equivalent.

    Do NOT force same barcode into one group when different real product names occur.
    """
    preferred: dict[str, str] = {}
    if path is None:
        return preferred
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if not {'name', 'candidates'}.issubset(reader.fieldnames or []):
            raise CollectorError('name_report.csv needs name,candidates columns')
        for row in reader:
            candidate = text(row['name'])
            if not candidate:
                continue
            # Candidate spelling is not used as an identity alias. Only display equivalence.
            pref_key = normalize_product(candidate)[2]
            for part in text(row['candidates']).split(' | '):
                if ':' not in part:
                    continue
                _brand, raw = part.split(':', 1)
                raw = raw.strip()
                # Safe only if already equivalent under the same normalization rules.
                for hint in ('', 'LUNCHBOX', 'TRIANGLE_KIMBAP'):
                    if normalize_product(raw, hint)[2] == pref_key:
                        preferred[pref_key] = candidate
                        break
    return preferred


def document_fields(document: Any) -> dict[str, Any]:
    if not isinstance(document, dict) or 'field' not in document:
        raise CollectorError('7-Eleven Document lacks field')
    fields = document['field']
    if isinstance(fields, dict):
        return {str(k): (v.get('value') if isinstance(v, dict) and 'value' in v else v)
                for k, v in fields.items()}
    if isinstance(fields, list):
        out = {}
        for d in fields:
            if not isinstance(d, dict) or 'value' not in d:
                raise CollectorError('unexpected document field list layout')
            k = d.get('name', d.get('fieldName', d.get('key')))
            if not k:
                raise CollectorError('document field missing name')
            out[str(k)] = d['value']
        return out
    raise CollectorError('7-Eleven Document.field has unsupported type')


def get_documents(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list) and all(isinstance(x, dict) and all(k in x for k in REQUIRED) for x in payload):
        return payload  # optional normalized offline JSON list
    try:
        collections = payload['data']['SearchQueryResult']['Collection']
    except (TypeError, KeyError) as e:
        raise CollectorError('unexpected API response; missing data.SearchQueryResult.Collection') from e
    if not isinstance(collections, list):
        raise CollectorError('Collection is not an array')
    offline = next((x for x in collections if isinstance(x, dict) and x.get('CollectionId') == 'offline'), None)
    if offline is None:
        raise CollectorError('offline Collection missing; refusing silent partial result')
    docs = offline.get('Documentset', {}).get('Document')
    if docs is None:
        return []
    if not isinstance(docs, list):
        raise CollectorError('Document is not an array')
    return [document_fields(x) for x in docs]


class Client:
    def __init__(self, timeout: float, min_delay: float):
        self.timeout = timeout
        self.min_delay = min_delay
        self.last: float | None = None

    def get(self, q: str, page: int, count: int) -> Any:
        body = json.dumps({'collection': 'goods', 'query': q, 'sort': 'quantity/desc,itemOnm/asc',
                           'startCount': page, 'listCount': count}, ensure_ascii=True).encode()
        req = Request(ENDPOINT, data=body, method='POST', headers={
            'Content-Type': 'application/json', 'Accept': 'application/json',
            'User-Agent': 'PyeonriDataCollector/1.0'})
        for attempt in range(3):
            if self.last is not None:
                time.sleep(max(0, self.min_delay - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            try:
                with urlopen(req, timeout=self.timeout) as resp:
                    if 'json' not in resp.headers.get('Content-Type', '').lower():
                        raise CollectorError('response is not JSON (possibly an HTML block page)')
                    raw = resp.read(10_000_001)
                    if len(raw) > 10_000_000:
                        raise CollectorError('response exceeds 10MB')
                    return json.loads(raw.decode('utf-8-sig'))
            except HTTPError as e:
                if e.code in (401, 403, 404, 429):
                    raise CollectorError(f'HTTP {e.code}: stop (do not bypass or retry)') from e
                if e.code < 500 or attempt == 2:
                    raise CollectorError(f'HTTP {e.code} query={q!r}, page={page}') from e
                LOG.warning('HTTP %s, retrying', e.code)
            except (URLError, TimeoutError, ConnectionError) as e:
                if attempt == 2:
                    raise CollectorError(f'network query={q!r}, page={page}: {e}') from e
                LOG.warning('temporary connection failure, retrying: %s', e)
            except (json.JSONDecodeError, UnicodeError) as e:
                raise CollectorError('invalid JSON returned') from e
            time.sleep(3)
        raise CollectorError('all retries failed')


def collect_online(queries: list[str], count: int, max_pages: int, client: Client) -> tuple[list[dict[str, Any]], dict[str, int]]:
    docs = []
    page_counts = {}
    for q in queries:
        fingerprints: set[tuple[str, ...]] = set()
        for page in range(max_pages):
            LOG.info('query=%s page=%d', q, page)
            batch = get_documents(client.get(q, page, count))
            if not batch:
                page_counts[q] = page + 1
                break
            stamp = tuple(text(x.get('itemCd')) for x in batch)
            if stamp in fingerprints:
                raise CollectorError(f'repeated API page query={q!r} page={page}')
            fingerprints.add(stamp)
            docs.extend(batch)
        else:
            raise CollectorError(f'exceeded --max-pages={max_pages} for {q!r}; partial scan refused')
    return docs, page_counts


def parse_price(value: Any) -> int:
    if value is None or isinstance(value, bool):
        raise ValueError('missing price')
    try:
        d = Decimal(str(value).replace(',', '').strip())
    except InvalidOperation as e:
        raise ValueError(f'invalid price {value!r}') from e
    if not d.is_finite() or d != d.to_integral_value() or not (0 < d <= 100000):
        raise ValueError(f'invalid/nonpositive price {value!r}')
    return int(d)


def parse_event(value: Any) -> str:
    raw = re.sub(r'\s+', '', text(value))
    if raw not in EVENT_MAP:
        raise ValueError(f'unrecognized promotion {raw!r}')
    return EVENT_MAP[raw]


def prepare_products(docs: list[dict[str, Any]], categories: dict[str, set[str]], preferred: dict[str, str]) -> tuple[list[Product], list[dict[str, str]], Counter]:
    by_identity_category: dict[str, set[str]] = defaultdict(set)
    pre: list[tuple[dict[str, Any], str, str, str, int | None, str | None, str]] = []
    invalid: list[dict[str, str]] = []
    counts = Counter()
    for f in docs:
        missing = [k for k in REQUIRED if k not in f]
        if missing:
            raise CollectorError(f'API schema changed; missing required fields: {missing}')
        code, source_name, cls = text(f['itemCd']), text(f['itemOnm']), text(f['dispClassNm'])
        if not code or not source_name:
            invalid.append({'source_code': code, 'source_name': source_name, 'raw_category': cls,
                            'normalized_name': '', 'reason': 'missing barcode or name'})
            counts['invalid'] += 1
            continue
        if explicitly_gift_only(source_name):
            invalid.append({'source_code': code, 'source_name': source_name, 'raw_category': cls,
                            'normalized_name': '', 'reason': 'explicit gift-only item'})
            counts['gift_only'] += 1
            continue
        cat = classify('SEVEN', cls, '', '', source_name)
        name, maker, norm, size, unit = normalize_with_category(source_name, cat)
        pre.append((f, name, maker, norm, size, unit, cat))
        if cat:
            by_identity_category[norm].add(cat)
    products = []
    for f, name, maker, norm, size, unit, cat in pre:
        code, source_name, cls = text(f['itemCd']), text(f['itemOnm']), text(f['dispClassNm'])
        origin = 'SEVEN source'
        if not cat:
            # Fresh-food factory prefixes must not prevent same-name recovery.
            # Try category-specific name normalization, but only accept the
            # category whose own normalization agrees with the lookup.
            candidate_cats: set[str] = set()
            for hint in ('', 'LUNCHBOX', 'TRIANGLE_KIMBAP'):
                candidate_key = normalize_with_category(source_name, hint)[2]
                values = by_identity_category.get(candidate_key, set()) | categories.get(candidate_key, set())
                candidate_cats.update(cat_value for cat_value in values
                                      if hint == '' or cat_value == hint)
            if len(candidate_cats) == 1:
                cat = next(iter(candidate_cats))
                origin = 'same-name category recovery'
                # For fresh foods, normalize without the non-maker factory prefix.
                name, maker, norm, size, unit = normalize_with_category(source_name, cat)
            elif len(candidate_cats) > 1:
                invalid.append({'source_code': code, 'source_name': source_name, 'raw_category': cls,
                                'normalized_name': name, 'reason': 'conflicting cross-store categories: ' + '|'.join(sorted(candidate_cats))})
                counts['ambiguous_category'] += 1
                continue
            else:
                invalid.append({'source_code': code, 'source_name': source_name, 'raw_category': cls,
                                'normalized_name': name, 'reason': 'unmapped category (excluded from 7 target groups)'})
                counts['excluded_category'] += 1
                continue
        try:
            price = parse_price(f['onlinePrice'])
            event = parse_event(f['evnMnmNm'])
        except ValueError as e:
            invalid.append({'source_code': code, 'source_name': source_name, 'raw_category': cls,
                            'normalized_name': name, 'reason': str(e)})
            counts['invalid'] += 1
            continue
        display = preferred.get(norm, name)
        # Preferred names must remain equivalent to identity; never override an unlike SKU by barcode.
        if normalize_product(display, cat)[2] != norm:
            display = name
        products.append(Product(code, source_name, display, maker, norm, cls, cat, price, event,
                                size, unit, origin))
    return products, invalid, counts


def choose_sku(rows: list[Product]) -> Product:
    """Only called when price + event + category are identical within the brand."""
    return min(rows, key=lambda p: (0 if p.code.startswith('880') else 1, p.code, p.source_name))


def build_output(products: list[Product]) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], Counter]:
    """Return group CSV, product CSV, SKU comparison, conflict CSV, metrics."""
    # Same barcode + different names are deliberately separate identities.
    by_identity: dict[str, list[Product]] = defaultdict(list)
    for p in products:
        by_identity[p.identity].append(p)
    groups: list[dict[str, str]] = []
    out_products: list[dict[str, str]] = []
    comparison = []
    conflicts = []
    metrics = Counter()
    for identity in sorted(by_identity):
        batch = by_identity[identity]
        # Repeated rows from overlapping search queries must not count as separate SKUs.
        by_code: dict[str, Product] = {}
        inconsistent_same_code = False
        for p in batch:
            old = by_code.get(p.code)
            if old is None:
                by_code[p.code] = p
            elif (old.price, old.event, old.category, old.identity) != (p.price, p.event, p.category, p.identity):
                inconsistent_same_code = True
        unique = list(by_code.values())
        codes = sorted(by_code)
        prices = sorted({p.price for p in batch})
        events = sorted({p.event for p in batch})
        cats = sorted({p.category for p in batch})
        reasons = []
        if inconsistent_same_code:
            reasons.append('same barcode/name has inconsistent values across queries')
        if len(prices) > 1:
            reasons.append('same-name SKU has differing prices')
        if len(events) > 1:
            reasons.append('same-name SKU has differing promotions')
        if len(cats) > 1:
            reasons.append('same-name SKU has differing categories')
        if reasons:
            conflicts.append({'normalized_name': batch[0].name, 'source_codes': ' | '.join(codes),
                              'prices': ' | '.join(map(str, prices)), 'events': ' | '.join(events),
                              'categories': ' | '.join(cats), 'reason': '; '.join(reasons)})
            metrics['conflict_groups_excluded'] += 1
            metrics['conflict_skus_excluded'] += len(unique)
        else:
            chosen = choose_sku(unique)
            key = 'p-' + hashlib.sha256(identity.encode('utf-8')).hexdigest()[:32]
            groups.append({'product_key': key, 'name': chosen.name, 'maker': chosen.maker,
                           'category': chosen.category, 'size': str(chosen.size or ''),
                           'unit': chosen.unit or '', 'image_url': ''})
            # Names, not barcodes, determine identity; add name hash for reused barcodes.
            # Product ID <= 40 chars even for odd/non-barcode source codes.
            code_safe = chosen.code if re.fullmatch(r'[a-z0-9]{1,26}', chosen.code) else hashlib.sha256(chosen.code.encode()).hexdigest()[:20]
            # The identity hash also prevents product_id collisions if a code names different SKUs.
            pid = 'seven-' + code_safe + '-' + hashlib.sha256(identity.encode()).hexdigest()[:7]
            if len(pid) > 40:
                pid = 'seven-' + hashlib.sha256((chosen.code + identity).encode()).hexdigest()[:28]
            out_products.append({'product_id': pid, 'product_key': key, 'brand': 'SEVEN',
                                 'source_name': chosen.source_name, 'list_price': str(chosen.price),
                                 'event': chosen.event})
            if len(unique) > 1:
                metrics['merged_groups'] += 1
                metrics['merged_extra_skus'] += len(unique) - 1
        if len(unique) > 1 or reasons:
            decision = 'EXCLUDED_CONFLICT' if reasons else 'MERGED_EQUAL'
            for p in sorted(unique, key=lambda x: x.code):
                comparison.append({'normalized_name': p.name, 'category': p.category, 'source_code': p.code,
                                   'source_name': p.source_name, 'list_price': str(p.price), 'event': p.event,
                                   'raw_category': p.raw_category, 'decision': decision,
                                   'reason': '; '.join(reasons)})
    return groups, out_products, comparison, conflicts, metrics


def validate_output(groups: list[dict[str, str]], products: list[dict[str, str]]) -> None:
    keys = set()
    for row in groups:
        key = row['product_key']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', key) or len(key) > 60 or key in keys:
            raise CollectorError(f'invalid/duplicate group key: {key}')
        keys.add(key)
        if not row['name'] or len(row['name']) > 100 or len(row['maker']) > 40 or len(row['category']) > 30:
            raise CollectorError(f'group field too long/missing: {key}')
        if (bool(row['size']) != bool(row['unit'])) or (row['unit'] and row['unit'] not in ('ML', 'G')):
            raise CollectorError(f'invalid size/unit: {key}')
        if row['size'] and int(row['size']) <= 0:
            raise CollectorError(f'nonpositive size: {key}')
    ids = set()
    pair_keys = set()
    for row in products:
        pid, pk = row['product_id'], row['product_key']
        pair = pk, row['brand']
        if len(pid) > 40 or not pid.startswith('seven-') or pid in ids or pk not in keys or pair in pair_keys:
            raise CollectorError(f'invalid/duplicate product: {pid}')
        ids.add(pid)
        pair_keys.add(pair)
        if row['event'] not in VALID_EVENTS or int(row['list_price']) <= 0 or len(row['source_name']) > 100:
            raise CollectorError(f'invalid price/event/source_name: {pid}')
    if len(groups) != len(products):
        raise CollectorError('SEVEN-only export should have one product per group')
    for row in groups + products:
        if any('\r' in v or '\n' in v for v in row.values()):
            raise CollectorError('multiline CSV fields unsupported by Java CSV loader')


def write_csv(path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', newline='',
                                     dir=path.parent, prefix='.' + path.name,
                                     suffix='.tmp', delete=False) as f:
        temp = Path(f.name)
        try:
            writer = csv.DictWriter(f, fieldnames=columns, lineterminator='\n')
            writer.writeheader()
            writer.writerows(rows)
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    temp.replace(path)


def run(docs: list[dict[str, Any]], samples: Path | None = None, names: Path | None = None) -> tuple[dict[str, Any], dict[str, list[dict[str, str]]]]:
    if not docs:
        raise CollectorError('empty API response; not replacing CSV')
    category_index, barcode_name_index = read_category_samples(samples)
    preferred = read_name_report(names)
    products, excluded, pre_metrics = prepare_products(docs, category_index, preferred)
    groups, rows, comparisons, conflicts, build_metrics = build_output(products)
    if not rows:
        raise CollectorError('no usable products')
    validate_output(groups, rows)
    codes_by_name: dict[str, set[str]] = defaultdict(set)
    for p in products:
        codes_by_name[p.code].add(p.identity)
    reused_barcodes = [{'source_code': code, 'normalized_names': ' | '.join(sorted(ids)),
                        'note': 'not merged: same barcode but different normalized names'}
                       for code, ids in sorted(codes_by_name.items()) if len(ids) > 1]
    # Compare scanned seven names with cross-store names for the same barcode; informational only.
    seen_cross_name = [{'source_code': code, 'seven_name': p.name,
                        'other_names': ' | '.join(sorted(barcode_name_index[code] - {p.identity}))}
                       for p in products if (code := p.code) in barcode_name_index
                       and barcode_name_index[code] - {p.identity}]
    category_counts = dict(sorted(Counter(x['category'] for x in groups).items()))
    result = {'source_rows': len(docs), 'valid_pre_dedupe_rows': len(products),
              'groups': len(groups), 'products': len(rows), 'by_category': category_counts,
              'recovered_category_rows': sum(p.category_origin == 'same-name category recovery' for p in products),
              'excluded_reasons': dict(sorted(Counter(x['reason'] for x in excluded).items())),
              'cross_store_same_barcode_name_disagreements': len(seen_cross_name),
              'same_barcode_different_seven_names': len(reused_barcodes),
              'unresolved_price_event_conflicts': len(conflicts), **pre_metrics, **build_metrics}
    artifacts = {'groups': groups, 'products': rows, 'sku_comparison': comparisons,
                 'sku_conflicts': conflicts, 'excluded_items': excluded,
                 'same_barcode_name_review': reused_barcodes,
                 'cross_store_barcode_name_review': seen_cross_name}
    return result, artifacts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description='7-Eleven category recovery + SKU price/event conflict audit')
    ap.add_argument('--out-dir', type=Path, default=ARTIFACT_ROOT / 'seven_final_output')
    ap.add_argument('--category-samples', type=Path, default=REFERENCE_OUTPUT / 'category_audit_output/product_samples.csv', help='product_samples.csv from category audit')
    ap.add_argument('--name-report', type=Path, default=NAME_REPORT, help='teammate name_report.csv; equivalent names only')
    ap.add_argument('--query', action='append', dest='queries', help='repeat for additional/changed searches')
    ap.add_argument('--input-json', type=Path, action='append', help='saved full API response or list of raw fields (repeatable, offline)')
    ap.add_argument('--list-count', type=int, default=100)
    ap.add_argument('--max-pages', type=int, default=50)
    ap.add_argument('--min-delay', type=float, default=1.2)
    ap.add_argument('--timeout', type=float, default=15)
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--strict-conflicts', action='store_true', help='write audit reports but refuse CSV when prices/events differ')
    ap.add_argument('--verbose', action='store_true')
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format='%(levelname)s %(message)s')
    if not (1 <= args.list_count <= 100 and args.max_pages >= 1 and args.min_delay >= 1 and args.timeout > 0):
        ap.error('invalid limits: list-count 1..100, max-pages >=1, min-delay >=1, timeout >0')
    out = args.out_dir.resolve()
    targets = [out / 'product_group.csv', out / 'products.csv']
    if not args.force and any(p.exists() for p in targets):
        ap.error('CSV exists. Use a new --out-dir or --force')
    try:
        if args.input_json:
            docs = []
            for path in args.input_json:
                docs.extend(get_documents(json.loads(path.read_text(encoding='utf-8-sig'))))
            pages = {'offline_json_files': len(args.input_json)}
        else:
            docs, pages = collect_online(list(dict.fromkeys(args.queries or QUERIES)), args.list_count,
                                        args.max_pages, Client(args.timeout, args.min_delay))
        result, artifacts = run(docs, args.category_samples, args.name_report)
        result.update({'generated_at_utc': datetime.now(timezone.utc).isoformat(),
                       'source': ENDPOINT if not args.input_json else 'offline JSON file(s)',
                       'pages_by_query': pages,
                       'note': 'SEVEN-only. No automatic update of backend CSV or full 4-brand merge. '
                               'Other events are unpriced; no real-store price verification.'})
        out.mkdir(parents=True, exist_ok=True)
        write_csv(out / 'sku_comparison.csv', SKU_COLS, artifacts['sku_comparison'])
        write_csv(out / 'sku_conflicts.csv', CONFLICT_COLS, artifacts['sku_conflicts'])
        write_csv(out / 'excluded_items.csv', EXCLUDED_COLS, artifacts['excluded_items'])
        write_csv(out / 'same_barcode_name_review.csv', ['source_code', 'normalized_names', 'note'],
                  artifacts['same_barcode_name_review'])
        write_csv(out / 'cross_store_barcode_name_review.csv', ['source_code', 'seven_name', 'other_names'],
                  artifacts['cross_store_barcode_name_review'])
        (out / 'collection_report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if args.strict_conflicts and artifacts['sku_conflicts']:
            LOG.error('Found %s conflict groups; strict mode prevented CSV export. See sku_conflicts.csv',
                      len(artifacts['sku_conflicts']))
            return 2
        write_csv(targets[0], GROUP_COLS, artifacts['groups'])
        write_csv(targets[1], PRODUCT_COLS, artifacts['products'])
        LOG.info('wrote %d groups, %d products to %s', len(artifacts['groups']), len(artifacts['products']), out)
        LOG.info('recovered category rows=%d; same-name SKU conflicts=%d (excluded)',
                 result['recovered_category_rows'], len(artifacts['sku_conflicts']))
        return 0
    except (CollectorError, OSError, ValueError, json.JSONDecodeError) as e:
        LOG.error('Collection failed; CSV export aborted: %s', e)
        return 1


if __name__ == '__main__':
    sys.exit(main())
