#!/usr/bin/env python3
"""Inspect *raw* product categories from SEVEN, GS25, EMART24, and CU.

Uses publicly reachable, unofficial web/app endpoints described by the user's
2026-11-09 data-collection guide. No logins, bypasses, or inventory queries.
The output is a category audit, NOT a production catalog or a taxonomy.

Python 3.10+, standard library only. See tools/catalog/README.md.
"""
from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import html
import json
import logging
from pathlib import Path
import re
import sys
import time
from typing import Any
from catalog_paths import ARTIFACT_ROOT
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LOG = logging.getLogger("category_audit")

URLS = {
    "seven": "https://new.7-elevenapp.co.kr/api/v1/open/search/goods",
    "gs25": "https://b2c-apigw.woodongs.com/search/v3/totalSearch",
    "emart24": "https://everse.emart24.co.kr/stock/stock/search",
    "cu": "https://cu.bgfretail.com/product/productAjax.do",
}
DEFAULT_QUERIES = {
    "seven": ["콜라", "코카콜라", "펩시", "큰사발", "컵라면", "라면", "도시락", "삼각", "우유", "바나나우유", "커피"],
    "gs25": ["콜라", "코카콜라", "펩시", "컵라면", "큰사발", "봉지라면", "라면", "도시락", "삼각", "참치마요", "제육", "불고기"],
    "emart24": ["콜라", "코카콜라", "펩시", "큰사발", "라면", "도시락", "삼각", "우유", "커피"],
}
# CU's product endpoint has no per-product category fields. These are the
# site's *request menu* categories, not API-returned product categories.
CU_MENUS = [
    ("10", "1", "신선식품 / 도시락·샐러드·면"),
    ("10", "2", "신선식품 / 김밥·삼각김밥·주먹밥"),
    ("60", "", "음료"),
    ("50", "", "식품"),
]

SAMPLE_COLS = ["brand", "source_code", "name", "raw_category_1", "raw_category_2", "raw_category_3", "category_source", "current_seven_mapping", "first_query", "queries"]
CATEGORY_COLS = ["brand", "raw_category_1", "raw_category_2", "raw_category_3", "category_source", "distinct_products", "current_seven_mapping", "example_names", "query_examples"]


class AuditError(RuntimeError):
    pass


class HttpStatusError(AuditError):
    def __init__(self, code: int, url: str, explanation: str):
        self.code = code
        super().__init__(f"HTTP {code} at {url}: {explanation[:200]}")


class BudgetReached(AuditError):
    pass


def single(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)[:150]
    return re.sub(r"\s+", " ", str(value)).strip()


def doc_fields(doc: Any) -> dict[str, Any]:
    if not isinstance(doc, dict) or "field" not in doc:
        raise AuditError("Search Document missing 'field'; response shape changed")
    f = doc["field"]
    if isinstance(f, dict):
        return {str(k): (v.get("value") if isinstance(v, dict) and "value" in v else v) for k, v in f.items()}
    if isinstance(f, list):
        out: dict[str, Any] = {}
        for x in f:
            if not isinstance(x, dict) or "value" not in x:
                raise AuditError("Unsupported field-list item")
            key = x.get("name", x.get("fieldName", x.get("key")))
            if not key:
                raise AuditError("Field-list item has no name")
            out[str(key)] = x["value"]
        return out
    raise AuditError("Unrecognized Document.field format")


def find_key(data: Any, key: str, depth: int = 0) -> Any:
    if depth > 7:
        return None
    if isinstance(data, dict):
        if key in data:
            return data[key]
        for v in data.values():
            if isinstance(v, (dict, list)):
                found = find_key(v, key, depth + 1)
                if found is not None:
                    return found
    elif isinstance(data, list):
        for v in data[:10]:
            found = find_key(v, key, depth + 1)
            if found is not None:
                return found
    return None


def search_documents(payload: Any, collection_name: str) -> list[dict[str, Any]]:
    result = find_key(payload, "SearchQueryResult")
    if not isinstance(result, dict) or not isinstance(result.get("Collection"), list):
        raise AuditError("No SearchQueryResult.Collection array: API shape changed")
    collections = result["Collection"]
    collection = next((c for c in collections if isinstance(c, dict) and single(c.get("CollectionId")).lower() == collection_name.lower()), None)
    if collection is None:
        # Missing collection may mean an empty query, or a changed API. We
        # cannot safely distinguish them; record a failure, not an empty page.
        available = [single(c.get("CollectionId")) for c in collections if isinstance(c, dict)]
        raise AuditError(f"Collection '{collection_name}' missing; present={available}")
    docset = collection.get("Documentset")
    if not isinstance(docset, dict) or "Document" not in docset:
        raise AuditError(f"{collection_name}.Documentset.Document missing")
    docs = docset["Document"]
    if docs is None:
        return []
    if not isinstance(docs, list):
        raise AuditError("Document is not a list")
    return [doc_fields(d) for d in docs]


def emart_products(payload: Any) -> list[dict[str, Any]]:
    entries = find_key(payload, "productList")
    if not isinstance(entries, list):
        raise AuditError("No productList array: EMART24 API shape changed")
    if not all(isinstance(x, dict) for x in entries):
        raise AuditError("productList contains unexpected elements")
    return entries


SEVEN_COLA_RX = re.compile(r"콜라|코크|펩시", re.I)
SEVEN_EXCLUDE_RX = re.compile(r"쇼콜라|콜라겐|니콜라|리콜라", re.I)


def current_seven_mapping(category: str, name: str) -> str:
    """Mirror the current seven_to_csv.py rule to expose excluded classes."""
    cls = category.replace(" ", "").strip()
    short_name = name.replace(" ", "")
    if cls == "탄산음료" and SEVEN_COLA_RX.search(short_name) and not SEVEN_EXCLUDE_RX.search(short_name):
        return "COLA"
    if cls in ("컵라면", "용기면"):
        return "RAMEN_CUP"
    if cls == "봉지라면":
        return "RAMEN_BAG"
    if cls == "도시락":
        return "LUNCHBOX"
    if cls == "삼각김밥":
        return "TRIANGLE_KIMBAP"
    if cls in ("우유", "흰우유", "가공유", "유제품") and "우유" in short_name:
        return "MILK"
    if cls in ("커피", "커피음료", "액상커피"):
        return "COFFEE"
    return ""


@dataclass
class Item:
    brand: str
    code: str
    name: str
    c1: str
    c2: str = ""
    c3: str = ""
    category_source: str = "response"
    first_query: str = ""
    queries: set[str] = field(default_factory=set)
    legacy_category: str = ""

    def category_key(self) -> tuple[str, str, str, str, str]:
        return (self.brand, self.c1, self.c2, self.c3, self.category_source)


def parse_seven(payload: Any, query: str) -> list[Item]:
    items: list[Item] = []
    for f in search_documents(payload, "offline"):
        for required in ("itemCd", "itemOnm", "dispClassNm"):
            if required not in f:
                raise AuditError(f"SEVEN product missing {required}")
        name, cls = single(f["itemOnm"]), single(f["dispClassNm"])
        if not name:
            continue
        items.append(Item("SEVEN", single(f["itemCd"]), name, cls, first_query=query, legacy_category=current_seven_mapping(cls, name)))
    return items


def parse_gs25(payload: Any, query: str) -> list[Item]:
    items = []
    for f in search_documents(payload, "offlineItem"):
        if not any(k in f for k in ("itemCode", "itemName", "dptNm")):
            raise AuditError("GS25 offlineItem item lacks expected keys")
        name = single(f.get("itemName"))
        if not name:
            continue
        items.append(Item("GS25", single(f.get("itemCode")), name, single(f.get("dptNm")), single(f.get("lineNm")), single(f.get("clssNm")), first_query=query))
    return items


def parse_emart24(payload: Any, query: str) -> list[Item]:
    items = []
    for f in emart_products(payload):
        if not any(k in f for k in ("pluCd", "goodsNm", "gdsMclssNm")):
            raise AuditError("EMART24 product lacks expected keys")
        name = single(f.get("goodsNm"))
        if not name:
            continue
        items.append(Item("EMART24", single(f.get("pluCd")), name, single(f.get("gdsMclssNm")), single(f.get("gdsSclssNm")), first_query=query))
    return items


# HTML-based CU endpoint; menu categories are known from the submitted guide.
CU_CARD_RE = re.compile(r'<(?:li|div|article)\b[^>]*\bclass\s*=\s*(["\'])[^"\']*\bprod_list\b[^"\']*\1[^>]*>', re.I | re.S)
CU_NAME_RE = re.compile(r'\bclass\s*=\s*(["\'])[^"\']*\bname\b[^"\']*\1[^>]*>\s*<p[^>]*>(.*?)</p>', re.I | re.S)
CU_IMG_RE = re.compile(r'<img\b[^>]*\bsrc\s*=\s*(["\'])(.*?)\1', re.I | re.S)
CU_NOTHING_RE = re.compile(r'\bid\s*=\s*(["\'])nothing\1|조회된\s*상품이\s*없습니다', re.I)
STRIP_TAG_RE = re.compile(r"<[^>]*>")


def parse_cu_page(content: str, main: str, sub: str, label: str) -> tuple[list[Item], bool]:
    matches = list(CU_CARD_RE.finditer(content))
    if not matches and CU_NOTHING_RE.search(content):
        return [], True
    if not matches:
        raise AuditError("CU HTML has neither prod_list nor explicit no-results marker")
    items = []
    for i, start in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        fragment = content[start.start():end]
        name_match = CU_NAME_RE.search(fragment)
        if not name_match:
            raise AuditError(f"CU prod_list entry {i + 1} has no recognizable name")
        name = html.unescape(STRIP_TAG_RE.sub("", name_match.group(2))).strip()
        if not name:
            raise AuditError("CU prod_list entry name is empty")
        img = CU_IMG_RE.search(fragment)
        path = img.group(2) if img else ""
        code_match = re.search(r"/([0-9]{8,14})\.(?:jpg|jpeg|png)(?:\?|$)", path, re.I)
        code = code_match.group(1) if code_match else ""
        items.append(Item("CU", code, name, f"메뉴:{main}", f"소분류:{sub or '(없음)'}", label,
                          category_source="request_menu", first_query=f"{main}/{sub or '-'}"))
    return items, False


class Client:
    def __init__(self, timeout: float, delay: float, max_requests: int, user_agent: str):
        self.timeout = timeout
        self.delay = delay
        self.max_requests = max_requests
        self.agent = user_agent
        self.requests = 0
        self._last_request_at = 0.0

    def post(self, brand: str, payload: dict[str, Any], *, json_body: bool) -> bytes:
        if json_body:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            content_type = "application/json; charset=UTF-8"
        else:
            data = urlencode(payload).encode("utf-8")
            content_type = "application/x-www-form-urlencoded; charset=UTF-8"
        headers = {"User-Agent": self.agent, "Content-Type": content_type, "Accept": "application/json, text/html;q=0.9, */*;q=0.8"}
        if brand == "cu":
            headers["X-Requested-With"] = "XMLHttpRequest"
        # These are ordinary website origin headers, not credentials or bypasses.
        if brand == "gs25":
            headers["Origin"] = "https://woodongs.com"
            headers["Referer"] = "https://woodongs.com/"
        if brand == "emart24":
            headers["Origin"] = "https://everse.emart24.co.kr"
            headers["Referer"] = "https://everse.emart24.co.kr/"
        req = Request(URLS[brand], data=data, headers=headers, method="POST")
        for attempt in range(3):
            if self.requests >= self.max_requests:
                raise BudgetReached(f"Reached --max-requests={self.max_requests}")
            pause = self.delay - (time.monotonic() - self._last_request_at)
            if pause > 0:
                time.sleep(pause)
            self._last_request_at = time.monotonic()
            self.requests += 1
            try:
                with urlopen(req, timeout=self.timeout) as response:
                    body = response.read(8_000_000 + 1)
                    if len(body) > 8_000_000:
                        raise AuditError("Response is larger than 8 MB; stop to inspect")
                    return body
            except HTTPError as e:
                snippet = e.read(400).decode("utf-8", errors="replace")
                if e.code in (401, 403, 429) or not (500 <= e.code < 600) or attempt == 2:
                    raise HttpStatusError(e.code, URLS[brand], snippet) from e
                LOG.warning("%s server HTTP %d, retry %d/2", brand, e.code, attempt + 1)
            except (URLError, TimeoutError, ConnectionError) as e:
                if attempt == 2:
                    raise AuditError(f"Network error for {brand}: {e}") from e
                LOG.warning("%s network error, retry %d/2: %s", brand, attempt + 1, e)
            time.sleep(2.0 * (attempt + 1))
        raise AssertionError("unreachable")

    def post_json(self, brand: str, payload: dict[str, Any], *, json_body: bool) -> Any:
        raw = self.post(brand, payload, json_body=json_body)
        try:
            return json.loads(raw.decode("utf-8-sig"))
        except (UnicodeError, json.JSONDecodeError) as e:
            raise AuditError(f"{brand} returned non-JSON or invalid JSON (first 100 bytes={raw[:100]!r})") from e


@dataclass
class Result:
    items: dict[tuple[str, str], Item] = field(default_factory=dict)
    pages: dict[str, int] = field(default_factory=dict)
    truncations: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    inconsistencies: list[str] = field(default_factory=list)
    duplicates: int = 0
    raw_rows: dict[str, int] = field(default_factory=dict)

    def add(self, item: Item) -> None:
        self.raw_rows[item.brand] = self.raw_rows.get(item.brand, 0) + 1
        ident = item.code or "name-" + hashlib.sha1((item.name + "\x00" + item.c1 + "\x00" + item.c2).encode("utf-8")).hexdigest()
        k = (item.brand, ident)
        previous = self.items.get(k)
        if previous is None:
            item.queries.add(item.first_query)
            self.items[k] = item
            return
        self.duplicates += 1
        previous.queries.add(item.first_query)
        if previous.category_key() != item.category_key():
            problem = f"{item.brand} {ident}: conflicting categories {previous.category_key()} vs {item.category_key()}"
            if len(self.inconsistencies) < 100:
                self.inconsistencies.append(problem)
        if not previous.legacy_category and item.legacy_category:
            previous.legacy_category = item.legacy_category


def gather_seven(client: Client, result: Result, queries: list[str], max_pages: int) -> None:
    for query in queries:
        label = f"SEVEN / {query}"
        for page in range(max_pages):
            payload = {"collection": "goods", "query": query, "sort": "quantity/desc,itemOnm/asc", "startCount": page, "listCount": 100}
            products = parse_seven(client.post_json("seven", payload, json_body=True), query)
            result.pages[label] = page + 1
            for p in products:
                result.add(p)
            LOG.info("%s page=%d rows=%d", label, page, len(products))
            if not products:
                break
        else:
            result.truncations.append(f"{label}: max-pages={max_pages}, possibly more results")


def gather_gs25(client: Client, result: Result, queries: list[str]) -> None:
    for query in queries:
        label = f"GS25 / {query}"
        products = parse_gs25(client.post_json("gs25", {"query": query}, json_body=True), query)
        result.pages[label] = 1
        for p in products:
            result.add(p)
        LOG.info("%s rows=%d", label, len(products))
        if len(products) >= 50:
            result.truncations.append(f"{label}: GS25 search caps results around 50; not full catalog")


def gather_emart24(client: Client, result: Result, queries: list[str], max_pages: int) -> None:
    for query in queries:
        label = f"EMART24 / {query}"
        for page in range(1, max_pages + 1):
            payload = {"currentPage": page, "pageCnt": 10, "sortType": "SALE", "saleProductYn": "N", "searchWord": query}
            products = parse_emart24(client.post_json("emart24", payload, json_body=False), query)
            result.pages[label] = page
            for p in products:
                result.add(p)
            LOG.info("%s page=%d rows=%d", label, page, len(products))
            if not products:
                break
        else:
            result.truncations.append(f"{label}: max-pages={max_pages}, possibly more results")


def gather_cu(client: Client, result: Result, max_pages: int) -> None:
    for main, sub, name in CU_MENUS:
        label = f"CU / {main}/{sub or '-'} ({name})"
        for page in range(1, max_pages + 1):
            payload = {"pageIndex": page, "searchMainCategory": main, "searchSubCategory": sub,
                       "listType": 1, "searchCondition": "setA", "searchUseYn": "N",
                       "gdIdx": 0, "codeParent": main, "user_id": ""}
            raw = client.post("cu", payload, json_body=False)
            try:
                body = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                raise AuditError("CU HTML not UTF-8; inspect response encoding")
            products, is_end = parse_cu_page(body, main, sub, name)
            result.pages[label] = page
            for p in products:
                result.add(p)
            LOG.info("%s page=%d rows=%d", label, page, len(products))
            if is_end:
                break
        else:
            result.truncations.append(f"{label}: max-pages={max_pages}, possibly more results")


def csv_write(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_results(out: Path, result: Result, client: Client, selected_brands: list[str], success: dict[str, bool]) -> None:
    products = sorted(result.items.values(), key=lambda p: (p.brand, p.c1, p.c2, p.c3, p.name))
    sample_rows: list[dict[str, Any]] = []
    categories: dict[tuple[str, str, str, str, str], list[Item]] = {}
    for p in products:
        categories.setdefault(p.category_key(), []).append(p)
        sample_rows.append({"brand": p.brand, "source_code": p.code, "name": p.name, "raw_category_1": p.c1,
                            "raw_category_2": p.c2, "raw_category_3": p.c3, "category_source": p.category_source,
                            "current_seven_mapping": p.legacy_category, "first_query": p.first_query,
                            "queries": " | ".join(sorted(p.queries))})
    category_rows = []
    for (brand, c1, c2, c3, source), entries in sorted(categories.items()):
        mappings = sorted({p.legacy_category or "(미분류)" for p in entries}) if brand == "SEVEN" else []
        category_rows.append({"brand": brand, "raw_category_1": c1, "raw_category_2": c2,
                              "raw_category_3": c3, "category_source": source,
                              "distinct_products": len(entries),
                              "current_seven_mapping": " | ".join(mappings),
                              "example_names": " | ".join(p.name for p in entries[:5]),
                              "query_examples": " | ".join(sorted({p.first_query for p in entries})[:8])})
    csv_write(out / "raw_category_summary.csv", CATEGORY_COLS, category_rows)
    csv_write(out / "product_samples.csv", SAMPLE_COLS, sample_rows)
    seven_unmapped = [r for r in sample_rows if r["brand"] == "SEVEN" and not r["current_seven_mapping"]]
    csv_write(out / "seven_unmapped_samples.csv", SAMPLE_COLS, seven_unmapped)
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "Search-result sampling, NOT all categories in each chain's complete catalog",
        "source_endpoints": {k: URLS[k] for k in selected_brands},
        "brands_finished": success,
        "complete_without_errors": all(success.values()) and not result.errors,
        "all_requested_pages_reached_end": not result.truncations,
        "http_requests": client.requests,
        "pages_by_search": result.pages,
        "raw_product_occurrences": result.raw_rows,
        "deduplicated_products": {brand: sum(p.brand == brand.upper() for p in products) for brand in selected_brands},
        "distinct_category_paths": {brand: sum(key[0] == brand.upper() for key in categories) for brand in selected_brands},
        "duplicate_occurrences": result.duplicates,
        "seven_deduplicated_unmapped": len(seven_unmapped),
        "truncated_scopes": result.truncations,
        "errors": result.errors,
        "conflicting_category_examples": result.inconsistencies,
        "notes": [
            "CU categories are request-menu codes, not per-product categories returned by API.",
            "GS25 search may return at most ~50 products per collection; add more queries for coverage.",
            "No item is excluded for having an unknown category or promotion; prices/events are not fetched into DB.",
            "SEVEN current_seven_mapping reproduces the preexisting seven_to_csv rule for diagnostic comparison only.",
            "RAMEN vs RAMEN_CUP/RAMEN_BAG is a separate backend category-contract decision.",
            "Endpoints are unofficial and may change or prohibit automated access; stop on 401/403/429.",
        ],
    }
    (out / "audit_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    LOG.info("wrote %d unique product examples, %d raw category paths to %s", len(products), len(categories), out.resolve())
    LOG.info("SEVEN currently unmapped: %d (deduplicated; promotions NOT filtered)", len(seven_unmapped))
    if result.truncations:
        LOG.warning("%d query/menu scopes hit max-pages or provider cap; see audit_report.json", len(result.truncations))
    if result.errors:
        LOG.error("%d failed brand(s); see audit_report.json", len(result.errors))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Audit raw category values across convenience store goods APIs (no DB writes).")
    ap.add_argument("--brands", default="seven,gs25,emart24,cu", help="comma-separated: seven,gs25,emart24,cu")
    ap.add_argument("--query", action="append", help="repeatable; override search queries for SEVEN/GS25/EMART24")
    ap.add_argument("--max-pages", type=int, default=3, help="page limit per search/menu; default 3 for a safe sample")
    ap.add_argument("--max-requests", type=int, default=150, help="total HTTP request cap (includes retries)")
    ap.add_argument("--delay", type=float, default=1.2, help="minimum seconds between HTTP requests (min 1.0)")
    ap.add_argument("--timeout", type=float, default=15.0)
    ap.add_argument("--out-dir", type=Path, default=ARTIFACT_ROOT / 'category_audit_output')
    ap.add_argument("--user-agent", default="PyeonriCategoryAudit/1.0 (student project)")
    ap.add_argument("--force", action="store_true", help="allow overwrite of report/CSV files")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    brands = [x.strip().lower() for x in args.brands.split(",") if x.strip()]
    if not brands or any(b not in URLS for b in brands) or len(set(brands)) != len(brands):
        ap.error("--brands must be unique names from seven,gs25,emart24,cu")
    if args.max_pages < 1 or args.max_requests < 1 or args.delay < 1.0 or args.timeout <= 0:
        ap.error("need --max-pages>=1, --max-requests>=1, --delay>=1.0, --timeout>0")
    out = args.out_dir
    output_names = ["raw_category_summary.csv", "product_samples.csv", "seven_unmapped_samples.csv", "audit_report.json"]
    if not args.force and any((out / name).exists() for name in output_names):
        ap.error(f"Some results already exist in {out}; choose a new --out-dir or use --force")
    out.mkdir(parents=True, exist_ok=True)

    client = Client(args.timeout, args.delay, args.max_requests, args.user_agent)
    result = Result()
    successful: dict[str, bool] = {b: False for b in brands}
    for b in brands:
        queries = list(dict.fromkeys(args.query)) if args.query else DEFAULT_QUERIES.get(b, [])
        try:
            if b == "seven":
                gather_seven(client, result, queries, args.max_pages)
            elif b == "gs25":
                gather_gs25(client, result, queries)
            elif b == "emart24":
                gather_emart24(client, result, queries, args.max_pages)
            else:
                gather_cu(client, result, args.max_pages)
            successful[b] = True
        except (AuditError, UnicodeError) as e:
            msg = f"{b}: {type(e).__name__}: {e}"
            result.errors.append(msg)
            LOG.error("%s", msg)
            if isinstance(e, (BudgetReached, HttpStatusError)) and (isinstance(e, BudgetReached) or e.code == 429):
                LOG.error("Request budget or HTTP 429 reached; stop ALL remaining brands")
                break
    write_results(out, result, client, brands, successful)
    return 0 if not result.errors else 2


if __name__ == "__main__":
    sys.exit(main())
