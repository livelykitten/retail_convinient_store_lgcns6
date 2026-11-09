> **요구사항명세서 5절 사본 · 초안.** 2026-11-09 요구사항명세서의 API 절을 옮기고, 담당 · 검증 규칙 · 오류 코드를 덧붙였어요. 경로 · 필드 · enum을 바꾸려면 PM2(민경완)에게 먼저 말해 명세서를 고친 뒤 이 사본을 맞춰요. 둘이 다르면 명세서를 따라요. `(안)` = 제안값, `미정` = 아직 정하지 않은 값이에요.

# API 명세

## 1. 공통

| 항목 | 내용 |
| --- | --- |
| 기본 주소 | 로컬 `http://localhost:8080` (안) |
| 경로 접두어 | `/api` |
| 형식 | 요청과 응답 모두 JSON, UTF-8. 필드 이름은 camelCase |
| 인증 | 없음 |
| 길찾기 (FR-06) | API가 아니라 프런트에서 카카오맵 링크를 열어요: `https://map.kakao.com/link/to/{placeName},{y},{x}` |

## 2. 오류 응답

모든 API는 오류가 나면 같은 모양으로 응답해요.

```json
{ "code": "KAKAO_RATE_LIMIT", "message": "잠시 뒤 다시 시도해 주세요" }
```

| 상태 | code | 언제 |
| --- | --- | --- |
| 400 | `INVALID_PARAM` | 필수 값이 없거나 범위를 벗어날 때 |
| 429 | `KAKAO_RATE_LIMIT` | 카카오 API가 429를 줄 때 |
| 502 | `KAKAO_ERROR` | 그 밖의 카카오 API 오류 (`GET /api/stores`만. quotes는 매장 없이 200) |
| 500 | `INTERNAL_ERROR` (안) | 예상하지 못한 서버 오류. 명세에 없어 이서현이 확정 |

- `message`는 화면에 그대로 보여도 되는 한국어 문구로 써요 (안). 스택 트레이스를 싣지 않아요.
- 어떤 칸이 틀렸는지 알려 주는 `field` 칸은 명세에 없어요. 필요하면 스펙 변경으로 다뤄요.

## 3. 한눈에 보기

| 메서드 · 경로 | 요청 | 성공 응답 | 실패 | 담당 |
| --- | --- | --- | --- | --- |
| `GET /api/wallet-options` | 없음 | 200 `{ telecoms: [{ provider, grades: [string] }], cards: [string], pays: [string] }` | | 함석원 |
| `GET /api/categories/resolve?q=` | `q` 필수, 1 ~ 30자 | 200 `{ query, category, confidence, method }`. 못 찾으면 `category` = null. `method` = `AI` · `KEYWORD` | 400 `INVALID_PARAM` | 한예림 |
| `GET /api/products?category=` | `category` 필수 | 200 `Product[]` (product 칸, camelCase) | 400 `INVALID_PARAM` | 이서현 |
| `GET /api/stores?x=&y=&radius=` | `x` 경도 · `y` 위도 필수, `radius` 미터(기본 500, 최대 2000, 안) | 200 `[{ storeId, brand, placeName, distanceM, x, y, roadAddress }]` 거리순 | 400 `INVALID_PARAM` · 429 `KAKAO_RATE_LIMIT` · 502 `KAKAO_ERROR` | 노건우 |
| `POST /api/quotes` | [5절](#5-post-apiquotes) | 200 [5절](#5-post-apiquotes) | 400 `INVALID_PARAM` · 429 `KAKAO_RATE_LIMIT`. 그 밖의 매장 조회 실패는 502가 아니라 200(매장 칸 null) | 함석원 |

## 4. API별 상세

### 4-1. `GET /api/wallet-options` (FR-11)

할인 규칙표(`discount_rule`)에 있는 통신사 · 등급 · 카드 · 페이만 돌려줘요.

```json
{
  "telecoms": [
    { "provider": "KT", "grades": ["VIP", "GOLD"] }
  ],
  "cards": ["신한카드"],
  "pays": ["네이버페이"]
}
```

- 값은 예시예요. 실제 값은 할인 규칙표(류지범)를 따라요.
- 목록 순서: 미정(함석원). 안: 이름 가나다순

### 4-2. `GET /api/categories/resolve?q=` (FR-02)

| 파라미터 | 필수 | 규칙 |
| --- | --- | --- |
| `q` | Y | 1 ~ 30자. 앞뒤 공백을 지운 뒤 잰다 (안) |

```json
{ "query": "코크", "category": "COLA", "confidence": 0.95, "method": "AI" }
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `query` | string | 받은 검색어 |
| `category` | string \| null | 상품군. 못 찾으면 null |
| `confidence` | number | 0 ~ 1. 키워드 사전으로 찾았을 때의 값은 미정(한예림), 안: 1.0 |
| `method` | string | `AI` · `KEYWORD` |

- AI 호출이 실패하면 키워드 사전으로 대체하고 `method` = `KEYWORD`로 돌려줘요. 오류로 응답하지 않아요.

### 4-3. `GET /api/products?category=` (FR-07 · FR-09)

| 파라미터 | 필수 | 규칙 |
| --- | --- | --- |
| `category` | Y | 상품군 목록에 있는 값. 없는 값의 처리: 미정(이서현), 안: 400 `INVALID_PARAM` |

```json
[
  {
    "productId": "gs25-1001",
    "brand": "GS25",
    "name": "펩시콜라600ml",
    "maker": "롯데",
    "category": "COLA",
    "size": 600,
    "unit": "ML",
    "listPrice": 2500,
    "event": "ONE_PLUS_ONE",
    "dataMonth": "2026-08",
    "estimated": false,
    "pb": false
  }
]
```

필드 정의는 [erd.md 3-1](erd.md#3-1-상품-product)의 칸을 camelCase로 바꾼 것이에요.

### 4-4. `GET /api/stores?x=&y=&radius=` (FR-03)

| 파라미터 | 필수 | 규칙 |
| --- | --- | --- |
| `x` | Y | 경도 |
| `y` | Y | 위도 |
| `radius` | N | 미터. 기본 500, 최대 2000 (안). 넘으면 400인지 2000으로 줄이는지는 미정(노건우) |

```json
[
  {
    "storeId": "12345678",
    "brand": "GS25",
    "placeName": "GS25 역삼점",
    "distanceM": 120,
    "x": 127.03,
    "y": 37.50,
    "roadAddress": "서울 강남구 ..."
  }
]
```

- `storeId` · `placeName` · `x` · `y`는 카카오 응답의 `id` · `place_name` · `x` · `y`예요.
- 브랜드 판별: `place_name`이 `CU` · `GS25` · `세븐일레븐` · `이마트24`로 시작해요. 나머지 매장은 빼요. `brand` 값은 `CU` · `GS25` · `SEVEN` · `EMART24`
- 거리순(`distanceM` 오름차순)으로 돌려줘요.
- `distanceM`은 카카오가 주는 직선거리예요. **도보 거리 · 도보 시간은 백엔드가 주지 않아요.** 프런트가 매장 좌표(`x` · `y`)로 TMAP 보행자 경로 API를 불러서 받아요 (결정 2026-11-09).
- 카카오 응답은 저장하지 않아요.

## 5. `POST /api/quotes`

### 요청

```json
{
  "category": "COLA",
  "qty": 1,
  "x": 127.0276, "y": 37.4979, "radius": 500,
  "wallet": {
    "telecom": { "provider": "KT", "grade": "VIP" },
    "cards": ["신한카드"],
    "pays": ["네이버페이"],
    "prevMonthMet": true
  }
}
```

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `category` | Y | 상품군 |
| `qty` | Y | 1 ~ 10 |
| `x` · `y` | Y | 경도 · 위도 |
| `radius` | N | `GET /api/stores`와 같음 (안) |
| `wallet` | Y (안) | 아무것도 고르지 않았으면 `telecom` null, 빈 배열로 보내요 (FR-01: 할인 없이 계산) |
| `wallet.telecom` | N | null 가능 |
| `wallet.cards` · `wallet.pays` | Y | 빈 배열 가능 |
| `wallet.prevMonthMet` | Y (안) | 전월 실적 충족 여부 |

### 응답

```json
{
  "items": [{
    "brand": "GS25", "storeId": "12345678", "placeName": "GS25 역삼점",
    "distanceM": 120, "x": 127.03, "y": 37.50,
    "product": { "productId": "gs25-1001", "name": "펩시콜라600ml", "size": 600, "unit": "ML", "pb": false },
    "listPrice": 2500, "qty": 1, "paidQty": 1, "receivedQty": 2,
    "event": "ONE_PLUS_ONE", "eventPrice": 2500,
    "discounts": [{ "ruleId": "kt-vip-gs25", "type": "TELECOM", "label": "KT VIP", "amount": 0, "applied": false, "reason": "행사 상품 중복 불가" }],
    "finalPrice": 2500, "pointAmount": 0,
    "stockStatus": "IN_STOCK",
    "dataMonth": "2026-08", "estimated": false, "mockRule": false
  }],
  "notice": "매장마다 취급 상품이 다를 수 있음"
}
```

| 필드 | 설명 |
| --- | --- |
| `items[]` | 행 = 브랜드 × 상품. 그 브랜드에서 가장 가까운 매장 1곳 기준 |
| `brand` · `storeId` · `placeName` · `distanceM` · `x` · `y` | 매장 (`GET /api/stores`와 같음). `distanceM`은 직선거리 |
| `product` | `productId` · `name` · `size` · `unit` · `pb` |
| `listPrice` · `qty` · `paidQty` · `receivedQty` · `event` · `eventPrice` | 1단계 행사 ([requirements.md 2절](requirements.md#2-최종-결제액-계산-규칙-fr-04)) |
| `discounts[]` | 2 ~ 4단계 규칙. **적용 안 된 규칙도** `applied` = false와 `reason`으로 담아요 (화면 "상품별 할인 내역") |
| `discounts[].type` | `TELECOM` · `CARD` · `PAY` |
| `finalPrice` | `eventPrice` − 통신사 할인 − 결제 할인 |
| `pointAmount` | 4단계 적립액. 결제액에서 빼지 않아요 |
| `stockStatus` | `IN_STOCK` · `LOW` · `OUT` ([requirements.md 3절](requirements.md#3-재고-더미-규칙-fr-10)) |
| `dataMonth` · `estimated` | 상품의 기준 월, 추정 값 여부 (NFR-01) |
| `mockRule` | 적용된 할인 규칙 중 `source`가 NULL인 것이 있으면 true (NFR-01) |
| `notice` | 목록 아래 고정 문구 |

- 정렬: `finalPrice` 오름차순 → 같으면 `distanceM` 오름차순. `OUT` 행은 맨 아래 (안). 명세 2절 그대로예요. TMAP 도보 시간으로 다시 정렬할지는 프런트가 정해요.
- 반경 안에 그 브랜드 매장이 없으면 그 브랜드 행은 나오지 않아요.
- `discounts[]`에 담는 범위(사용자가 고른 수단의 규칙만인지, 브랜드가 맞는 규칙만인지), 적립 규칙의 `type` 표기: 미정(함석원)
- 1+1처럼 2개 받는 행사도 개당 가격이 아니라 `finalPrice`로 정렬해요. 개당 가격 칸은 두지 않아요 (결정 2026-11-09).

### 매장 조회가 실패했을 때 (결정 2026-11-09, NFR-02 기준)

명세 원본은 API 표(502)와 NFR-02(상품 목록만)가 달랐어요. NFR-02를 따르기로 정했어요. 요구사항명세서 원본 수정이 필요해요 (PM2).

| 카카오 결과 | 응답 |
| --- | --- |
| 429 | 429 `{ "code": "KAKAO_RATE_LIMIT", "message": "잠시 뒤 다시 시도해 주세요" }` |
| 그 밖의 오류 | 200. 그 상품군의 4사 상품을 모두 행으로 내고, 매장 칸과 재고는 null. 계산 · 할인 내역은 그대로 |

```json
{
  "items": [{
    "brand": "GS25", "storeId": null, "placeName": null,
    "distanceM": null, "x": null, "y": null,
    "product": { "productId": "gs25-1001", "name": "펩시콜라600ml", "size": 600, "unit": "ML", "pb": false },
    "listPrice": 2500, "qty": 1, "paidQty": 1, "receivedQty": 2,
    "event": "ONE_PLUS_ONE", "eventPrice": 2500,
    "discounts": [],
    "finalPrice": 2500, "pointAmount": 0,
    "stockStatus": null,
    "dataMonth": "2026-08", "estimated": false, "mockRule": false
  }],
  "notice": "매장마다 취급 상품이 다를 수 있음"
}
```

- 이때 정렬은 `finalPrice` 오름차순만 써요 (거리 · 재고 기준 없음).
- 화면은 **`storeId`가 null인지로** "매장 정보를 불러오지 못함"을 알아요. 따로 표시 칸을 두지 않아요 (결정 2026-11-09).
- 그래서 매장 조회는 **전부 성공하거나 전부 실패**예요. 카카오를 여러 번(페이지) 부르다가 한 번이라도 실패하면 전체를 실패로 보고, 모든 행의 매장 칸을 null로 내요. 일부 행만 null인 응답은 없어요.
- 반경 안에 4사 매장이 하나도 없으면 null 행이 아니라 `items: []`예요.
- 프런트는 `storeId`가 null인 행에서 길찾기(FR-06)와 TMAP 도보 시간 조회를 꺼요.
