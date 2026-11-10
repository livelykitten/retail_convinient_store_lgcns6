// 이마트24 수집기 — 상품 · 정가 · 행사, 매장, 시연 상품(공산품) 재고를 CSV로 뽑는다.
// 기준 문서: 데이터수집-가공-가이드 3-2 · 4절 · 5절 · 7절
//
// 실행: node tools/collector/emart24.mjs [--out data/collected] [--skip-stock]
// 외부 패키지 없음 (Node 18+ fetch).
//
// 실패 원칙(가이드 7절): 상품 · 매장 수집이 하나라도 실패하면 CSV를 쓰지 않고 끝낸다(기존 파일 유지).
// 재고는 건별 실패를 건너뛰고 받은 값만 쓴다.

import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

// ---------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------
const BRAND = 'EMART24';
const PREFIX = 'emart24';

const ORIGIN = { x: 127.0161846, y: 37.5628563 }; // 교육장
const RADIUS_M = 1000;

const SEARCH_WORDS = ['콜라', '코카콜라', '펩시', '큰사발', '라면', '도시락', '삼각'];
const STORE_AREAS = ['중구', '종로구', '동대문구', '성동구'];

// 가이드 6절 공산품(GS25 · 세븐 · 이마트24 공통 바코드). 이마트24 신선식품 재고는 믿을 수 없어 호출하지 않는다.
const DEMO_BARCODES = [
  '8801094082604', '8801094083205', '8801094082406', '8801056193010', '8801056150013',
  '8801043015981', '8801043017022', '8801043016025', '8801043014809', '8801045520124',
];

const CALL_GAP_MS = 1000;
const TIMEOUT_MS = 15000;
const RETRY = 2;
const RETRY_GAP_MS = 3000;
const MAX_PRICE = 100000;

const UA = 'Mozilla/5.0 (Linux; Android 15)';
const EVERSE_HEADERS = {
  'User-Agent': UA,
  Origin: 'https://everse.emart24.co.kr',
  Referer: 'https://everse.emart24.co.kr/',
};

// ---------------------------------------------------------------------
// HTTP (1초 간격 · 15초 타임아웃 · 5xx/타임아웃만 3초 간격 2회 재시도)
// ---------------------------------------------------------------------
class FatalHttpError extends Error {}

let lastCallAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callJson(url, init = {}) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCallAt + CALL_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();

    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      if (attempt < RETRY) { log(`  재시도(${e.name}) ${url}`); await sleep(RETRY_GAP_MS); continue; }
      throw new Error(`요청 실패 ${e.name}: ${url}`);
    }
    if (res.status >= 500) {
      if (attempt < RETRY) { log(`  재시도(${res.status}) ${url}`); await sleep(RETRY_GAP_MS); continue; }
      throw new Error(`HTTP ${res.status}: ${url}`);
    }
    if ([401, 403, 429].includes(res.status)) throw new FatalHttpError(`HTTP ${res.status}: ${url}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);

    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`JSON이 아닌 응답(구조 변경?): ${url} → ${text.slice(0, 80)}`);
    }
  }
}

// ---------------------------------------------------------------------
// 1. 상품 · 정가 · 행사
// ---------------------------------------------------------------------
async function searchPage(word, page) {
  const body = new URLSearchParams({
    currentPage: String(page), pageCnt: '10', sortType: 'SALE', saleProductYn: 'N', searchWord: word,
  });
  const d = await callJson('https://everse.emart24.co.kr/stock/stock/search', {
    method: 'POST',
    body,
    headers: { ...EVERSE_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
  });
  if (!d || !('productList' in d)) throw new Error(`productList 없음(구조 변경?): ${word} ${page}쪽`);
  return { list: d.productList ?? [], total: d.totalCnt };
}

async function collectRaw() {
  const byCode = new Map();
  for (const word of SEARCH_WORDS) {
    let got = 0;
    let total;
    for (let page = 1; ; page++) {
      const r = await searchPage(word, page);
      total ??= r.total;
      if (r.list.length === 0) break; // 200 + 0개일 때만 끝
      got += r.list.length;
      for (const p of r.list) if (p?.pluCd && !byCode.has(p.pluCd)) byCode.set(p.pluCd, p);
    }
    log(`검색 「${word}」 ${got}개 (totalCnt ${total ?? '?'})`);
    if (typeof total === 'number' && got < total) throw new Error(`「${word}」 쪽 넘김이 덜 끝남: ${got}/${total}`);
  }
  return [...byCode.values()];
}

// 4-1 상품군
const COLA_IN = /콜라|코크|펩시/;
const COLA_OUT = /쇼콜라|콜라겐|니콜라|리콜라/;

function categoryOf(p) {
  const m = p.gdsMclssNm ?? '';
  const s = p.gdsSclssNm ?? '';
  const name = p.goodsNm ?? '';
  if (m === '탄산음료' && COLA_IN.test(name) && !COLA_OUT.test(name)) return 'COLA';
  if (m === '면식품' && s.startsWith('용기면')) return 'RAMEN_CUP';
  if (m === '면식품' && s.startsWith('봉지면')) return 'RAMEN_BAG';
  if (m === '도시락' && s === '정찬도시락') return 'LUNCHBOX';
  if (m === '주먹밥' && (s === '일반삼각' || s === '더큰삼각')) return 'TRIANGLE_KIMBAP';
  return null;
}

// 4-2 바코드 · 같은 상품 · 이름
const CU_CLASS_MARK = new Set(['도', '삼', '빅삼', '김', '주', '샌', '햄', '샐', '면']);
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(ml|l|g)/i;

function barcodeOf(code) {
  if (code.startsWith('27')) return null;
  return /^\d{13}$/.test(code) ? code : null;
}

function makerOf(name) {
  const m = name.match(/^([^)]+)\)/);
  if (!m) return null;
  return CU_CLASS_MARK.has(m[1]) ? null : m[1];
}

function sizeOf(name) {
  const m = name.match(SIZE_RE);
  if (!m) return { size: null, unit: null };
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'l') return { size: Math.round(n * 1000), unit: 'ML' };
  return { size: Math.round(n), unit: u === 'ml' ? 'ML' : 'G' };
}

function displayNameOf(name) {
  return name
    .replace(/^[^)]+\)/, '')
    .replace(new RegExp(SIZE_RE.source, 'ig'), '')
    .replace(/(PET|P)$/, '')
    .trim();
}

// 4-3 행사
const EVENT_MAP = { '1+1': 'ONE_PLUS_ONE', '2+1': 'TWO_PLUS_ONE', '3+1': 'THREE_PLUS_ONE' };
function eventOf(title) {
  if (title == null || title === '') return 'NONE';
  return EVENT_MAP[title] ?? 'OTHER';
}

// 4-4 가격
function pricesOf(p) {
  const view = Number(p.viewPrice);
  const origin = Number(p.originPrice);
  if (p.title === '세일') return { list: origin > 0 ? origin : view, sale: view };
  return { list: view, sale: null };
}

function toProductRow(p, collectedAt) {
  const code = String(p.pluCd ?? '').trim();
  const name = String(p.goodsNm ?? '').trim();
  if (!code || !name) return { drop: '이름 · 코드 빈 값' };
  if (name.startsWith('앱예약)') || name.startsWith('앱)')) return { drop: null }; // 조용히 버림
  const category = categoryOf(p);
  if (!category) return { drop: null };

  const { list, sale } = pricesOf(p);
  if (!Number.isFinite(list) || list <= 0 || list > MAX_PRICE) return { drop: `정가 불량(${p.viewPrice}/${p.originPrice}) ${code} ${name}` };

  const barcode = barcodeOf(code);
  const { size, unit } = sizeOf(name);
  return {
    row: {
      product_id: `${PREFIX}-${code}`,
      brand: BRAND,
      source_code: code,
      barcode,
      group_key: barcode ?? `${PREFIX}-${name.replace(/[12]편$/, '')}`,
      name,
      display_name: displayNameOf(name) || name,
      maker: makerOf(name),
      category,
      size,
      unit,
      pb: false,
      fresh: category === 'LUNCHBOX' || category === 'TRIANGLE_KIMBAP',
      list_price: list,
      sale_price: sale,
      event: eventOf(p.title),
      event_label: p.title ?? null,
      event_override: null,
      image_url: null, // 응답에 이미지 없음. 4사 합칠 때 같은 barcode의 GS25 · CU 이미지를 복사
      collected_at: collectedAt,
    },
  };
}

// ---------------------------------------------------------------------
// 2. 매장
// ---------------------------------------------------------------------
function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.y - a.y);
  const dLng = rad(b.x - a.x);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.y)) * Math.cos(rad(b.y)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function collectStores(updatedAt) {
  const today = updatedAt.slice(0, 10).replaceAll('-', '.');
  const byCode = new Map();
  for (const area of STORE_AREAS) {
    let got = 0;
    for (let page = 1; ; page++) {
      const url = 'https://emart24.co.kr/api1/store?' + new URLSearchParams({ page: String(page), AREA1: '서울특별시', AREA2: area });
      const d = await callJson(url, { headers: { 'User-Agent': UA } });
      if (!d || !('data' in d)) throw new Error(`매장 data 없음(구조 변경?): ${area} ${page}쪽`);
      const list = d.data ?? [];
      if (list.length === 0) break;
      got += list.length;
      for (const s of list) byCode.set(s.CODE, s);
    }
    log(`매장 ${area} ${got}곳`);
  }

  const rows = [];
  for (const s of byCode.values()) {
    if (s.END_DATE && s.END_DATE < today) continue; // 폐점
    const x = Number(s.LONGITUDE);
    const y = Number(s.LATITUDE);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !s.CODE || !s.TITLE) continue;
    const dist = distanceM(ORIGIN, { x, y });
    if (dist > RADIUS_M) continue;
    rows.push({
      store_id: `${PREFIX}-${s.CODE}`,
      brand: BRAND,
      name: s.TITLE,
      address: s.ADDRESS ?? null,
      x,
      y,
      updated_at: updatedAt,
      _code: s.CODE,
      _dist: Math.round(dist),
    });
  }
  rows.sort((a, b) => a._dist - b._dist);
  return rows;
}

// ---------------------------------------------------------------------
// 3. 재고 (시연 공산품만, 매장 10곳씩)
// ---------------------------------------------------------------------
async function collectStock(products, stores, checkedAt) {
  const demo = products.filter((p) => DEMO_BARCODES.includes(p.source_code) && !p.fresh);
  const missing = DEMO_BARCODES.filter((b) => !products.some((p) => p.source_code === b));
  if (missing.length) log(`재고: 이마트24 수집 결과에 없는 시연 바코드 ${missing.join(', ')}`);

  const codes = stores.map((s) => s._code);
  const rows = [];
  let failStreak = 0;
  outer: for (const p of demo) {
    for (let i = 0; i < codes.length; i += 10) {
      const chunk = codes.slice(i, i + 10);
      const url = 'https://everse.emart24.co.kr/api/stock/v3/stock-search/store?' +
        new URLSearchParams({ searchPluCode: p.source_code, bizNoArr: chunk.join(',') });
      let d;
      try {
        d = await callJson(url, { headers: EVERSE_HEADERS });
        failStreak = 0;
      } catch (e) {
        log(`  재고 실패 ${p.source_code} [${chunk[0]}…]: ${e.message}`);
        if (e instanceof FatalHttpError) { log('재고: 401·403·429라 이번 주기 종료'); break outer; }
        if (/HTTP 4\d\d/.test(e.message)) continue; // 400·404는 그 건만
        if (++failStreak >= 5) { log('재고: 5건 연속 실패라 이번 주기 종료'); break outer; }
        continue;
      }
      for (const q of d?.storeGoodsQty ?? []) {
        const qty = q?.BIZQTY;
        if (qty == null || !Number.isInteger(Number(qty)) || Number(qty) < 0) continue; // -1 · null은 미확인
        if (!chunk.includes(q.BIZNO)) continue;
        rows.push({ product_id: p.product_id, store_id: `${PREFIX}-${q.BIZNO}`, qty: Number(qty), checked_at: checkedAt });
      }
    }
  }
  return { rows, demoCount: demo.length };
}

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------
const PRODUCT_COLS = ['product_id', 'brand', 'source_code', 'barcode', 'group_key', 'name', 'display_name', 'maker',
  'category', 'size', 'unit', 'pb', 'fresh', 'list_price', 'sale_price', 'event', 'event_label', 'event_override',
  'image_url', 'collected_at'];
const STORE_COLS = ['store_id', 'brand', 'name', 'address', 'x', 'y', 'updated_at'];
const STOCK_COLS = ['product_id', 'store_id', 'qty', 'checked_at'];

function cell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
const toCsv = (cols, rows) => [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';

async function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}

// ---------------------------------------------------------------------
function log(msg) { console.error(msg); }

function nowKst() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 19); // KST, 2026-11-10T09:40:00
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : 'data/collected';
  const skipStock = args.includes('--skip-stock');
  const at = nowKst();

  // 상품 · 매장: 실패하면 아무것도 쓰지 않는다
  const raw = await collectRaw();
  const products = [];
  const dropped = [];
  for (const p of raw) {
    const r = toProductRow(p, at);
    if (r.row) products.push(r.row);
    else if (r.drop) dropped.push(r.drop);
  }
  products.sort((a, b) => a.category.localeCompare(b.category) || a.product_id.localeCompare(b.product_id));
  for (const d of dropped) log(`  버림: ${d}`);

  const stores = await collectStores(at);

  const count = {};
  for (const p of products) count[p.category] = (count[p.category] ?? 0) + 1;
  log(`상품 ${products.length}개 ${JSON.stringify(count)} · 원본 ${raw.length}개 · 불량 ${dropped.length}개`);
  log(`매장 1km 안 ${stores.length}곳`);
  if (products.length === 0 || stores.length === 0) throw new Error('상품 또는 매장이 0건이라 저장하지 않음');

  await mkdir(outDir, { recursive: true });
  await writeAtomic(path.join(outDir, 'emart24_products.csv'), toCsv(PRODUCT_COLS, products));
  await writeAtomic(path.join(outDir, 'emart24_stores.csv'), toCsv(STORE_COLS, stores));

  if (!skipStock) {
    const { rows, demoCount } = await collectStock(products, stores, at);
    log(`재고 ${rows.length}행 (시연 상품 ${demoCount}개 × 매장 ${stores.length}곳)`);
    await writeAtomic(path.join(outDir, 'emart24_stock.csv'), toCsv(STOCK_COLS, rows));
  }
  log(`저장: ${outDir}`);
}

main().catch((e) => {
  log(`수집 실패 — CSV를 바꾸지 않았어요: ${e.message}`);
  process.exit(1);
});
