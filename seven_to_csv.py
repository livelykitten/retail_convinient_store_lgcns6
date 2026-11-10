#!/usr/bin/env python3
"""Fetch 7-Eleven goods and produce CSV compatible with feat/db-schema.

No third-party packages. No login, token, or anti-bot bypass.

This collector intentionally writes a standalone SEVEN-only export, not a merge
into the project's existing multi-brand CSVs. Review / merge separately.

Usage:
    python seven_to_csv.py --out-dir ./seven_csv_output --query 콜라 --query 도시락
    python seven_to_csv.py --input-json ./saved_response.json --out-dir ./seven_csv_output

Notes:
    - Data source is a non-partner endpoint used by the provider's app/web.
    - The source response schema and terms of use may change without notice.
    - Never mislabel unrecognized promotions as NONE.
"""
from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
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
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ENDPOINT = "https://new.7-elevenapp.co.kr/api/v1/open/search/goods"
IMAGE_PREFIX = "https://www.7-eleven.co.kr/upload/product"
DEFAULT_QUERIES = ["콜라", "코카콜라", "펩시", "큰사발", "컵라면", "라면", "도시락", "삼각", "우유", "바나나우유", "커피"]
GROUP_COLS = ["product_key", "name", "maker", "category", "size", "unit", "image_url"]
PRODUCT_COLS = ["product_id", "product_key", "brand", "source_name", "list_price", "event"]
SUPPORTED_EVENTS = {"NONE", "ONE_PLUS_ONE", "TWO_PLUS_ONE", "THREE_PLUS_ONE"}
log = logging.getLogger("seven_to_csv")


class CollectionError(Exception):
    """A failed fetch or incompatible response: don't publish partial CSV."""


@dataclass(frozen=True)
class Item:
    source_code: str
    source_name: str
    display_name: str
    category: str
    price: int
    event: str
    product_key: str
    size: int | None
    unit: str | None


# The guide classifies by provider's product class, not mere search keyword.
# This avoids categorizing unrelated products such as collagen as cola.
COLA_RX = re.compile(r"콜라|코크|펩시", re.I)
COLA_EXCLUSION_RX = re.compile(r"쇼콜라|콜라겐|니콜라|리콜라", re.I)
SIZE_RX = re.compile(r"(?<!\d)(\d+(?:\.\d+)?)\s*(ml|㎖|l|g)(?![a-z])", re.I)


def clean_field(value: Any, *, max_len: int = 100) -> str:
    """No commas, quotes or line breaks: Java CSV loader uses naive split(',')."""
    result = re.sub(r"\s+", " ", str(value or "")).strip()
    result = result.replace(",", "，").replace('"', "＂")
    if len(result) > max_len:
        raise ValueError(f"text exceeds DB limit ({max_len}): {result[:60]!r}")
    return result


def product_category(provider_class: str, name: str) -> str | None:
    cls = provider_class.replace(" ", "").strip()
    normalized_name = name.replace(" ", "")
    if cls == "탄산음료" and COLA_RX.search(normalized_name) and not COLA_EXCLUSION_RX.search(normalized_name):
        return "COLA"
    if cls in ("컵라면", "용기면"):
        return "RAMEN_CUP"
    if cls == "봉지라면":
        return "RAMEN_BAG"
    if cls == "도시락":
        return "LUNCHBOX"
    if cls == "삼각김밥":
        return "TRIANGLE_KIMBAP"
    # Extra categories are allowed by feat/db-schema VARCHAR(30), but their
    # source class names need verifying against an actual provider response.
    if cls in ("우유", "흰우유", "가공유", "유제품") and "우유" in normalized_name:
        return "MILK"
    if cls in ("커피", "커피음료", "액상커피"):
        return "COFFEE"
    return None


def event_from_source(value: Any) -> str:
    raw = re.sub(r"\s+", "", str(value or ""))
    if raw == "":
        return "NONE"
    table = {"1+1": "ONE_PLUS_ONE", "2+1": "TWO_PLUS_ONE", "3+1": "THREE_PLUS_ONE"}
    if raw not in table:
        raise ValueError(f"unknown/non-representable event {raw!r}; requires review")
    return table[raw]


def parse_price(value: Any) -> int:
    if value is None or isinstance(value, bool):
        raise ValueError("missing price")
    raw = str(value).replace(",", "").strip()
    try:
        amount = Decimal(raw)
    except InvalidOperation as error:
        raise ValueError(f"non-numeric price {value!r}") from error
    if amount != amount.to_integral_value() or not (0 < amount <= 100_000):
        raise ValueError(f"out-of-range/non-integer price {value!r}")
    return int(amount)


def extract_size(name: str) -> tuple[int | None, str | None]:
    found = list(SIZE_RX.finditer(name))
    if not found:
        return None, None
    match = found[-1]
    amount = Decimal(match.group(1))
    unit = match.group(2).lower()
    if unit in ("ml", "㎖"):
        unit = "ML"
    elif unit == "l":
        unit = "ML"
        amount *= 1000
    else:
        unit = "G"
    if amount <= 0 or amount != amount.to_integral_value():
        return None, None
    return int(amount), unit


def normalize_name(source_name: str) -> str:
    """Remove non-consumer prefixes such as '코카)' or '삼)' without inventing maker."""
    return clean_field(re.sub(r"^[^()（）\s]{1,18}[)）]\s*", "", source_name) or source_name, max_len=100)


def group_key(source_code: str) -> str:
    # Shared GS25/CU/7-Eleven/Emart product barcodes are a possible common key.
    if re.fullmatch(r"\d{13}", source_code) and not source_code.startswith("27"):
        return source_code
    # Brand-specific/non-barcode codes MUST NOT be merged with other brands.
    digest = hashlib.sha256(source_code.encode("utf-8")).hexdigest()[:28]
    return f"seven-{digest}"


def item_id(source_code: str) -> str:
    if re.fullmatch(r"[a-z0-9-]{1,34}", source_code):
        return f"seven-{source_code}"
    digest = hashlib.sha256(source_code.encode("utf-8")).hexdigest()[:28]
    return f"seven-{digest}"


def document_fields(document: Any) -> dict[str, Any]:
    """Support both {'field': {...}} and {'field': [{'name':..,'value':..}]}.

    Stop on unrecognized layouts rather than quietly publishing empty values.
    """
    if not isinstance(document, dict) or "field" not in document:
        raise CollectionError("Document lacks field")
    fields = document["field"]
    if isinstance(fields, dict):
        # Some search frameworks wrap each value in {'value': '...'}.
        return {str(key): value.get("value") if isinstance(value, dict) and "value" in value else value
                for key, value in fields.items()}
    if isinstance(fields, list):
        values: dict[str, Any] = {}
        for entry in fields:
            if not isinstance(entry, dict):
                raise CollectionError("unexpected field list element")
            key = entry.get("name", entry.get("fieldName", entry.get("key")))
            if not key or "value" not in entry:
                raise CollectionError("field list entry lacks name/value")
            values[str(key)] = entry["value"]
        return values
    raise CollectionError(f"unsupported Document.field type: {type(fields).__name__}")


def extract_offline_documents(payload: Any) -> list[dict[str, Any]]:
    try:
        data = payload["data"]["SearchQueryResult"]
        collections = data["Collection"]
    except (TypeError, KeyError) as exc:
        raise CollectionError("unexpected response: missing data.SearchQueryResult.Collection") from exc
    if not isinstance(collections, list):
        raise CollectionError("Collection must be an array")
    offline = next((col for col in collections if isinstance(col, dict) and col.get("CollectionId") == "offline"), None)
    if offline is None:
        if not collections:
            return []
        raise CollectionError("offline Collection missing; refuse to treat as empty page")
    try:
        documents = offline["Documentset"]["Document"]
    except (TypeError, KeyError) as exc:
        raise CollectionError("offline.Documentset.Document missing") from exc
    if documents is None:
        return []
    if not isinstance(documents, list):
        raise CollectionError("offline.Document must be an array")
    return [document_fields(doc) for doc in documents]


def parse_item(fields: dict[str, Any]) -> Item | None:
    # An unknown class is outside the selected catalog; do not guess class
    # based only on the search term.
    required = ("itemCd", "itemOnm", "onlinePrice", "evnMnmNm", "dispClassNm")
    if any(key not in fields for key in required):
        raise CollectionError(f"unexpected item layout; missing {[k for k in required if k not in fields]}")
    name = clean_field(fields["itemOnm"], max_len=100)
    if not name:
        raise ValueError("missing product name")
    cls = clean_field(fields["dispClassNm"], max_len=100)
    category = product_category(cls, name)
    if category is None:
        return None
    code = str(fields["itemCd"] or "").strip()
    if not code or len(code) > 60:
        raise ValueError("missing/too-long itemCd")
    price = parse_price(fields["onlinePrice"])
    event = event_from_source(fields["evnMnmNm"])
    display = normalize_name(name)
    size, unit = extract_size(display)
    return Item(code, name, display, category, price, event, group_key(code), size, unit)


class Client:
    def __init__(self, timeout: float, min_delay: float, user_agent: str):
        self.timeout = timeout
        self.min_delay = min_delay
        self.user_agent = user_agent
        self.last_request: float | None = None

    def pause(self) -> None:
        if self.last_request is not None:
            remaining = self.min_delay - (time.monotonic() - self.last_request)
            if remaining > 0:
                time.sleep(remaining)
        self.last_request = time.monotonic()

    def fetch(self, query: str, page: int, count: int) -> Any:
        body = json.dumps({"collection": "goods", "query": query,
                           "sort": "quantity/desc,itemOnm/asc",
                           "startCount": page, "listCount": count}, ensure_ascii=True).encode("utf-8")
        request = Request(ENDPOINT, data=body, method="POST", headers={
            "Content-Type": "application/json", "User-Agent": self.user_agent,
            "Accept": "application/json",
        })
        for attempt in range(3):
            self.pause()
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    content_type = response.headers.get("Content-Type", "").lower()
                    if "json" not in content_type:
                        raise CollectionError(f"non-JSON Content-Type: {content_type!r}")
                    raw = response.read(10_000_001)
                    if len(raw) > 10_000_000:
                        raise CollectionError("response over 10 MB")
                    return json.loads(raw.decode("utf-8-sig"))
            except HTTPError as exc:
                if exc.code in (401, 403, 404, 429):
                    raise CollectionError(f"HTTP {exc.code} (do not retry or bypass)") from exc
                if exc.code < 500 or attempt == 2:
                    raise CollectionError(f"HTTP {exc.code} on query={query!r} page={page}") from exc
                log.warning("HTTP %s; retry %s/2", exc.code, attempt + 1)
            except (TimeoutError, URLError, ConnectionError) as exc:
                if attempt == 2:
                    raise CollectionError(f"network error on query={query!r} page={page}: {exc}") from exc
                log.warning("network error; retry %s/2: %s", attempt + 1, exc)
            except (UnicodeError, json.JSONDecodeError) as exc:
                raise CollectionError("server returned invalid JSON") from exc
            time.sleep(3)
        raise CollectionError("fetch retry exhausted")


def collect_online(client: Client, queries: list[str], list_count: int, max_pages: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    rows: list[dict[str, Any]] = []
    pages_by_query: dict[str, int] = {}
    for query in queries:
        seen_page_fingerprints: set[tuple[str, ...]] = set()
        for page in range(max_pages):
            log.info("POST goods query=%r page=%d", query, page)
            documents = extract_offline_documents(client.fetch(query, page, list_count))
            if not documents:
                pages_by_query[query] = page + 1
                log.info("completed query=%r; total scanned=%s", query, len(rows))
                break
            fingerprint = tuple(str(doc.get("itemCd", "")) for doc in documents)
            if fingerprint in seen_page_fingerprints:
                raise CollectionError(f"query={query!r} repeated page content at page={page}; pagination may be broken")
            seen_page_fingerprints.add(fingerprint)
            rows.extend(documents)
        else:
            raise CollectionError(f"query={query!r} reached --max-pages={max_pages}; refusing partial export")
    return rows, pages_by_query


def add_item(existing: dict[str, Item], item: Item, conflicts: list[str]) -> None:
    previous = existing.get(item.source_code)
    if previous is None:
        existing[item.source_code] = item
        return
    if previous.price != item.price or previous.category != item.category:
        conflicts.append(f"itemCd={item.source_code}: price/category conflict: {previous.price}/{previous.category} vs {item.price}/{item.category}")
        return
    if previous.event == item.event:
        return
    if previous.event == "NONE":
        existing[item.source_code] = item
    elif item.event == "NONE":
        return
    else:
        conflicts.append(f"itemCd={item.source_code}: conflicting promotions {previous.event} vs {item.event}")


def verified_image_url(code: str, client: Client) -> str:
    if not re.fullmatch(r"\d{13}", code):
        return ""
    url = f"{IMAGE_PREFIX}/{code[:7]}/{code[7:]}.1.jpg"
    client.pause()
    try:
        request = Request(url, method="GET", headers={"User-Agent": client.user_agent})
        with urlopen(request, timeout=client.timeout) as response:
            if response.headers.get("Content-Type", "").lower().startswith("image/"):
                beginning = response.read(16)
                # Verify image signature: a 200 response can contain HTML.
                if beginning.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"RIFF", b"GIF8")):
                    return url
    except (HTTPError, URLError, TimeoutError, ConnectionError):
        pass
    return ""


def build_csv_rows(items: dict[str, Item], image_client: Client | None = None) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    groups: dict[str, dict[str, str]] = {}
    products: list[dict[str, str]] = []
    for item in sorted(items.values(), key=lambda it: it.source_code):
        key = item.product_key
        if key in groups:
            raise CollectionError(f"duplicate (product_key, SEVEN) would violate DB UNIQUE: {key}")
        groups[key] = {
            "product_key": key,
            "name": item.display_name,
            "maker": "",  # Prefix e.g. '코카)' is not a verified manufacturer.
            "category": item.category,
            "size": str(item.size) if item.size is not None else "",
            "unit": item.unit or "",
            "image_url": verified_image_url(item.source_code, image_client) if image_client else "",
        }
        products.append({
            "product_id": item_id(item.source_code),
            "product_key": key,
            "brand": "SEVEN",
            "source_name": item.source_name,
            "list_price": str(item.price),
            "event": item.event,
        })
    return list(groups.values()), products


def check_constraints(groups: list[dict[str, str]], products: list[dict[str, str]]) -> None:
    keys = set()
    for row in groups:
        key = row["product_key"]
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", key) or len(key) > 60:
            raise CollectionError(f"invalid product_key for DB: {key!r}")
        if key in keys:
            raise CollectionError(f"duplicate product_key: {key}")
        keys.add(key)
        if len(row["name"]) > 100 or len(row["image_url"]) > 300 or len(row["maker"]) > 40:
            raise CollectionError(f"oversized group field: {key}")
    ids = set()
    for row in products:
        pid = row["product_id"]
        if not pid.startswith("seven-") or len(pid) > 40 or pid in ids:
            raise CollectionError(f"invalid/duplicate product_id: {pid}")
        ids.add(pid)
        if row["product_key"] not in keys:
            raise CollectionError(f"missing group FK: {pid}")
        if row["event"] not in SUPPORTED_EVENTS:
            raise CollectionError(f"invalid Event: {pid}")
        if len(row["source_name"]) > 100 or int(row["list_price"]) <= 0:
            raise CollectionError(f"invalid product: {pid}")
    # The Java loader does not understand CSV quoting or multiline values.
    for row in groups + products:
        if any("," in value or "\r" in value or "\n" in value for value in row.values()):
            raise CollectionError(f"field incompatible with Java split(','): {row}")


def write_csv_atomic(path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", dir=path.parent,
                                     prefix=f".{path.name}.", suffix=".tmp", delete=False) as f:
        tmp = Path(f.name)
        try:
            writer = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        except BaseException:
            tmp.unlink(missing_ok=True)
            raise
    tmp.replace(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="7-Eleven JSON -> feat/db-schema CSV (SEVEN only)")
    parser.add_argument("--out-dir", type=Path, default=Path("seven_csv_output"))
    parser.add_argument("--query", action="append", dest="queries", help="repeatable; defaults to 11 predefined queries")
    parser.add_argument("--input-json", type=Path, help="offline: a single saved HTTP response, instead of calling the API")
    parser.add_argument("--list-count", type=int, default=100)
    parser.add_argument("--max-pages", type=int, default=50)
    parser.add_argument("--min-delay", type=float, default=1.0)
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--user-agent", default="PyeonriHackathonDataCheck/1.0")
    parser.add_argument("--check-images", action="store_true", help="verify real image bytes (can be slow)")
    parser.add_argument("--force", action="store_true", help="overwrite existing CSV files in --out-dir")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    if not 1 <= args.list_count <= 100 or args.max_pages < 1 or args.min_delay < 1 or args.timeout <= 0:
        parser.error("require 1 <= --list-count <= 100, --max-pages >= 1, --min-delay >= 1, --timeout > 0")
    out = args.out_dir.resolve()
    targets = [out / "product_group.csv", out / "products.csv"]
    if not args.force and any(p.exists() for p in targets):
        parser.error(f"CSV already exists under {out}; choose a new --out-dir or pass --force")
    try:
        if args.input_json:
            payload = json.loads(args.input_json.read_text(encoding="utf-8-sig"))
            docs = extract_offline_documents(payload)
            pages_by_query = {"offline-input": 1}
        else:
            queries = list(dict.fromkeys(args.queries or DEFAULT_QUERIES))
            client = Client(args.timeout, args.min_delay, args.user_agent)
            docs, pages_by_query = collect_online(client, queries, args.list_count, args.max_pages)
        if not docs:
            raise CollectionError("no source rows; refusing to write an empty catalog")

        items: dict[str, Item] = {}
        stats = {"source_rows": len(docs), "excluded_category": 0, "invalid_rows": 0,
                 "unsupported_events": 0, "duplicates": 0, "rejected_examples": []}
        conflicts: list[str] = []
        for row in docs:
            try:
                item = parse_item(row)
            except CollectionError:
                raise  # A changed schema is not an ignorable bad product.
            except ValueError as exc:
                stats["invalid_rows"] += 1
                if "event" in str(exc):
                    stats["unsupported_events"] += 1
                if len(stats["rejected_examples"]) < 30:
                    stats["rejected_examples"].append({"itemCd": str(row.get("itemCd", "")), "reason": str(exc)})
                continue
            if item is None:
                stats["excluded_category"] += 1
                continue
            if item.source_code in items:
                stats["duplicates"] += 1
            add_item(items, item, conflicts)
        if conflicts:
            raise CollectionError("conflicting product data (first 5): " + "; ".join(conflicts[:5]))
        if not items:
            raise CollectionError("no usable classified items; check source data / category rules")
        img_client = Client(args.timeout, args.min_delay, args.user_agent) if args.check_images else None
        groups, products = build_csv_rows(items, img_client)
        check_constraints(groups, products)

        out.mkdir(parents=True, exist_ok=True)
        # Build everything in memory first. Existing output is not touched on errors.
        write_csv_atomic(targets[0], GROUP_COLS, groups)
        write_csv_atomic(targets[1], PRODUCT_COLS, products)
        report = {
            "source": ENDPOINT if not args.input_json else str(args.input_json),
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "note": "SEVEN-only. Not merged with existing product CSV. Promotions/prices unverified at physical stores.",
            "pages_by_query": pages_by_query,
            "groups": len(groups), "products": len(products),
            "by_category": {k: sum(1 for g in groups if g["category"] == k)
                            for k in sorted({g["category"] for g in groups})},
            **stats,
        }
        (out / "collection_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        log.info("wrote %d groups and %d products to %s", len(groups), len(products), out)
        log.info("skipped category=%d invalid=%d (unsupported event=%d)",
                 stats["excluded_category"], stats["invalid_rows"], stats["unsupported_events"])
        return 0
    except (CollectionError, OSError, ValueError, json.JSONDecodeError) as exc:
        log.error("collection aborted, CSV was not regenerated: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
