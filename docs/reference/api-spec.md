> **`API명세최종.md` 사본.** 프런트(진성민)가 정한 최종 API 명세(2026-11-09)를 그대로 옮겼어요. 경로 · 필드 · enum · 오류 코드는 이 문서가 기준이에요. 바꾸려면 [스펙 변경](../CONTRIBUTING.md#스펙-변경) 순서대로 진성민 · PM2(민경완)와 먼저 맞추고 원본과 이 사본을 함께 고쳐요. 옛 요구사항명세서 5절의 `category` · `qty` · `items[]` · `discounts[]`(`applied` · `reason`) · `finalPrice` 정렬 · `pointAmount` · `notice` · `mockRule` · `estimated` · `dataMonth`는 쓰지 않아요 (결정 2026-11-10).

# 편리 REST API 명세 v1.1 — B 매대 가격표 화면 기준

| 항목 | 값 |
|---|---|
| 기준 | 피그마 「편리 · B 매대 가격표 · 전체 화면 (11.09)」 하나만. 화면에 보이는 값과 동작에서 API를 뽑았다 |
| 화면 | 메인 컷 · P1~P4 상품 목록 · M1~M3 지도 · D1~D4 할인 수단 |
| API | **4개** — `GET /api/wallet-options` · `POST /api/quotes` · `GET /api/stores` · **`GET /api/routes/walking`** |
| 원안 | 프론트 진성민, 2026-11-09 |
| 개정 내용 | M2 실제 보행 경로 API 추가, 추정 도보시간과 실제 소요시간 구분, 샘플 데이터 일관성 수정 |
| 범위 | 최신 Figma P1~P4 / M1~M3 / D1~D4 화면 + 실제 도보 경로 구현 요구 |

---

## 1. 화면이 보여 주는 것 → 필요한 데이터

| 화면 | 화면에 보이는 것 | 데이터 출처 |
|---|---|---|
| 메인 컷 | 「편리」 로고, 문구 | 없음(정적) |
| P1 첫 화면 | 검색창, 「원하는 상품을 검색해 보세요.」 | 없음 |
| P2 검색 결과 | 「'우유' 검색 결과 2」, 정렬 「가까운 순」, 상품마다 **이미지 · 정확한 상품명 · 행사 배지(2+1) · 정가 · 개당 최저가 · 주변 N개 매장** | `POST /api/quotes` |
| P3 매장 펼침 | 상품 아래 매장마다 **브랜드 · 매장명 · 할인 유형(2+1 행사) · 도보 N분 · 거리 · 내 할인 수단 아이콘(최대 4 + …) · 개당 가격 · 재고** | P2 응답에 포함(추가 호출 없음) |
| P4 목적지 유지 | 고른 매장에 「목적지」 표시 | 프론트 상태 |
| M1 지도 | 내 위치, 주변 4사 매장 마커(브랜드), 「주변 편의점 4곳」 | `GET /api/stores` + 브라우저 위치 |
| M2 매장 선택 | 목적지 마커 강조, 내 위치 → 매장 **실제 도보 경로**, **매장명 · 실제 도보 N분 · 경로 거리 · 고른 상품명 · 개당 가격** | P3에서 선택한 매장 + **`GET /api/routes/walking`** |
| M3 위치 없음 | 「현재 위치를 확인할 수 없어요」, 다시 시도 | 브라우저 위치 |
| D1 할인 수단 목록 | 등록한 수단마다 **아이콘 · 종류 · 이름 · 등급(통신사만)**, 수정 · 삭제, 추가 버튼 | 브라우저 저장(localStorage) |
| D2 미등록 | 「아직 등록한 할인 수단이 없어요」 | 브라우저 저장 |
| D3 추가 폼 | 종류 4개 → 선택지(통신사 · 등급 / 카드 상품 · 카드사 / 간편결제 / 편의점 멤버십), 이미 등록한 것은 「등록됨」 | `GET /api/wallet-options` + 브라우저 저장 |
| D4 삭제 확인 | 「SKT 멤버십을 삭제할까요?」 | 브라우저 저장 |

할인 수단 목록 · 추가 · 수정 · 삭제는 **서버에 저장하지 않는다**(로그인 없음). 검색할 때 요청 본문 `wallet` 으로 함께 보낸다.

---

## 2. 공통

- JSON, 경로 접두어 `/api`, 인증 없음, UTF-8
- 필드 camelCase, 코드값 대문자 enum(3절)
- 금액 = 원 단위 정수, 원 미만 버림. 거리 = 미터 정수. 시간 = 초 정수(표시용 분은 올림). 좌표 = **`x` 경도 · `y` 위도 (WGS84)**
- **도보시간 구분:** `POST /api/quotes`/`GET /api/stores`의 `walkMin`은 **직선거리 기반 추정치**. M2의 **실제 경로 거리·소요시간은 `GET /api/routes/walking` 응답**으로 표시한다.
- `GET /api/routes/walking`의 REST API 인증키는 백엔드 환경변수에 보관한다. 브라우저에는 노출하지 않는다. 지도/마커/Polyline 렌더링은 카카오맵 JavaScript SDK로 프론트에서 수행한다.
- 오류 응답 본문

```json
{ "code": "KAKAO_RATE_LIMIT", "message": "잠시 뒤 다시 시도해 주세요" }
```

| HTTP | code | 언제 | 화면 |
|---|---|---|---|
| 400 | `INVALID_PARAM` | 필수값 없음 · 범위 밖 | 검색창 아래 문구 |
| 429 | `KAKAO_RATE_LIMIT` | 매장 조회 한도 초과 | 「잠시 뒤 다시 시도해 주세요」 |
| 502 | `KAKAO_ERROR` | 카카오 매장/경로 조회 실패 | 매장 정보 또는 경로 조회 실패 안내 |
| 404 | `ROUTE_NOT_FOUND` | 보행 경로를 찾지 못함 | 매장 마커는 유지하고 「도보 경로를 찾지 못했어요」 |
| 500 | `INTERNAL` | 그 밖 | 공통 오류 문구 |

---

## 3. 코드값

| 이름 | 값 | 화면 표기 |
|---|---|---|
| `Brand` | `CU` · `GS25` · `SEVEN` · `EMART24` | CU · GS25 · 세븐일레븐 · 이마트24 |
| `MethodType` | `TELECOM` · `CARD` · `PAY` · `MEMBERSHIP` | 통신사 멤버십 · 신용·체크카드 · 간편결제 · 편의점 멤버십 |
| `Telecom` | `SKT` · `KT` · `LGU` | SKT · KT · LG U+ |
| `TelecomGrade` | `VIP` · `NORMAL` · `UNKNOWN` | VIP · 일반 · 모름 |
| `Pay` | `KAKAOPAY` · `NAVERPAY` · `TOSSPAY` · `SAMSUNGWALLET` | 카카오페이 · 네이버페이 · 토스페이 · 삼성월렛 |
| `CardIssuer` | `SHINHAN` · `KB` · `SAMSUNG` · `HYUNDAI` · `LOTTE` · `WOORI` · `HANA` · `BC` · `NH` | 신한 · KB국민 · 삼성 · 현대 · 롯데 · 우리 · 하나 · BC · NH농협 |
| `Event` | `NONE` · `ONE_PLUS_ONE` · `TWO_PLUS_ONE` · `THREE_PLUS_ONE` | (없음) · 1+1 · 2+1 · 3+1 |
| `StockStatus` | `IN_STOCK` · `LOW` · `OUT` | 있음 · 적음 · 없음 |
| `Sort` | `DISTANCE` · `PRICE` | 가까운 순 · 싼 순 |

---

## 4. API

### 4-1. `GET /api/wallet-options` — 할인 수단 선택지 (D3)

요청 값 없음. 서버 할인 규칙에 있는 것만 내려준다.

**응답 200**

```json
{
  "telecoms": [
    { "code": "SKT", "name": "SKT", "grades": ["VIP", "NORMAL", "UNKNOWN"] },
    { "code": "KT", "name": "KT", "grades": ["VIP", "NORMAL", "UNKNOWN"] },
    { "code": "LGU", "name": "LG U+", "grades": ["VIP", "NORMAL", "UNKNOWN"] }
  ],
  "cards": [
    { "cardId": "shinhan-deepdream-check", "name": "신한카드 Deep Dream 체크", "issuer": "SHINHAN" },
    { "cardId": "shinhan-mrlife", "name": "신한카드 Mr.Life", "issuer": "SHINHAN" }
  ],
  "cardIssuers": [
    { "code": "SHINHAN", "name": "신한" },
    { "code": "KB", "name": "KB국민" },
    { "code": "WOORI", "name": "우리" }
  ],
  "pays": [
    { "code": "KAKAOPAY", "name": "카카오페이" },
    { "code": "NAVERPAY", "name": "네이버페이" },
    { "code": "TOSSPAY", "name": "토스페이" },
    { "code": "SAMSUNGWALLET", "name": "삼성월렛" }
  ],
  "memberships": [
    { "brand": "CU", "name": "CU 멤버십" },
    { "brand": "GS25", "name": "GS&POINT" },
    { "brand": "SEVEN", "name": "세븐일레븐 멤버십" },
    { "brand": "EMART24", "name": "이마트24 멤버십" }
  ]
}
```

| 필드 | 화면 쓰임 |
|---|---|
| `telecoms[].grades` | D3 통신사 폼의 등급 칩(VIP · 일반 · 모름) |
| `cards` | D3 카드 폼의 「카드 상품명 검색」 목록. 프론트가 입력값으로 걸러 보여 준다 |
| `cardIssuers` | D3 카드 「직접 입력」 때 카드사 칩 |
| `pays` · `memberships` | D3 간편결제 · 편의점 멤버십 선택지 |

### 4-2. `POST /api/quotes` — 상품 검색 · 매장별 개당 가격 (P2 · P3)

**요청**

```json
{
  "q": "우유",
  "x": 127.0563,
  "y": 37.5446,
  "radius": 500,
  "sort": "DISTANCE",
  "wallet": {
    "telecom": { "provider": "SKT", "grade": "VIP" },
    "cards": [
      { "cardId": "shinhan-deepdream-check", "issuer": "SHINHAN" },
      { "cardId": null, "name": "우리카드 카드의정석 체크", "issuer": "WOORI" }
    ],
    "pays": ["KAKAOPAY", "NAVERPAY"],
    "memberships": ["CU"]
  }
}
```

| 필드 | 필수 | 규칙 |
|---|---|---|
| `q` | 필수 | 검색창 입력. 1~30자. 「콜라」 「바나나우유」처럼 대충 쓴 말도 받는다 |
| `x` · `y` | 필수 | 내 위치. 위치를 못 얻으면 프론트가 기본 좌표(교육장)를 보낸다 |
| `radius` | 선택 | 미터. 기본 500, 최대 2000 |
| `sort` | 선택 | 기본 `DISTANCE`. 화면 「가까운 순 ⌄」 |
| `wallet` | 선택 | D1에 등록한 수단. 없으면 할인 없이 계산 |
| `wallet.telecom` | 선택 | null 가능. `grade` 는 `VIP` · `NORMAL` · `UNKNOWN` |
| `wallet.cards[]` | 선택 | 목록에서 고른 카드 = `cardId` + `issuer`. 직접 입력한 카드 = `cardId: null` + `name` + `issuer` |
| `wallet.pays[]` · `wallet.memberships[]` | 선택 | 빈 배열 가능 |

**응답 200**

```json
{
  "query": "우유",
  "products": [
    {
      "productKey": "binggrae-banana-240",
      "name": "빙그레 바나나맛우유 240ml",
      "imageUrl": "https://example.com/banana.png",
      "event": "TWO_PLUS_ONE",
      "listPrice": 1500,
      "minUnitPrice": 1000,
      "storeCount": 2,
      "stores": [
        {
          "storeId": "12345678",
          "brand": "CU",
          "placeName": "CU 성수연무장점",
          "x": 127.0571, "y": 37.5431,
          "distanceM": 240,
          "walkMin": 4,
          "event": "TWO_PLUS_ONE",
          "eventLabel": "2+1 행사",
          "unitPrice": 1000,
          "applicableMethods": [
            { "type": "TELECOM", "code": "SKT" },
            { "type": "CARD", "code": "shinhan-deepdream-check" },
            { "type": "PAY", "code": "KAKAOPAY" },
            { "type": "PAY", "code": "NAVERPAY" },
            { "type": "MEMBERSHIP", "code": "CU" }
          ],
          "stockStatus": "IN_STOCK"
        },
        {
          "storeId": "87654321",
          "brand": "GS25",
          "placeName": "GS25 성수역점",
          "x": 127.0559, "y": 37.5448,
          "distanceM": 380,
          "walkMin": 6,
          "event": "TWO_PLUS_ONE",
          "eventLabel": "2+1 행사",
          "unitPrice": 1000,
          "applicableMethods": [
            { "type": "CARD", "code": "shinhan-deepdream-check" },
            { "type": "PAY", "code": "KAKAOPAY" },
            { "type": "PAY", "code": "NAVERPAY" }
          ],
          "stockStatus": "LOW"
        }
      ]
    },
    {
      "productKey": "maeil-barista-latte-325",
      "name": "매일 바리스타룰스 카페라떼 325ml",
      "imageUrl": null,
      "event": "ONE_PLUS_ONE",
      "listPrice": 2500,
      "minUnitPrice": 1250,
      "storeCount": 1,
      "stores": [
        {
          "storeId": "example-cafe-01",
          "brand": "SEVEN",
          "placeName": "세븐일레븐 예시점",
          "x": 127.0580, "y": 37.5450,
          "distanceM": 210,
          "walkMin": 4,
          "event": "ONE_PLUS_ONE",
          "eventLabel": "1+1 행사",
          "unitPrice": 1250,
          "applicableMethods": [],
          "stockStatus": "IN_STOCK"
        }
      ]
    }
  ]
}
```

> 모든 가격·매장·경로 값은 API 형식 설명을 위한 **예시 데이터**이며 실제 판매·운영 정보를 뜻하지 않는다.

**상품(`products[]`) 필드**

| 필드 | 화면 | 뜻 |
|---|---|---|
| `productKey` | 상품 펼침 · 닫힘 구분 | 4사의 **같은 상품**을 하나로 묶는 키 |
| `name` | 상품명 | 정확한 상품명(용량 포함) |
| `imageUrl` | 상품 이미지 | 없으면 null → 프론트 기본 그림 |
| `event` | 상품명 옆 행사 배지 | 매장들 중 개당 가격이 가장 싼 매장의 행사 |
| `listPrice` | 「정가 1,500원」 | 정가 |
| `minUnitPrice` | 「개당 최저가 1,000원」 | `stores[].unitPrice` 중 최솟값 |
| `storeCount` | 「주변 2개 매장」 | `stores` 개수 |
| `stores` | P3 매장 목록 | 아래 |

**매장(`stores[]`) 필드**

| 필드 | 화면 | 뜻 |
|---|---|---|
| `storeId` | 목적지 선택 구분 | 매장 고유 id |
| `brand` | 브랜드 아이콘 | `Brand` |
| `placeName` | 매장명 | 「CU 성수연무장점」 |
| `x` · `y` | M2 목적지 마커 · 경로 | 매장 좌표 |
| `distanceM` | 「240m」 | 내 위치에서 직선 거리 |
| `walkMin` | 상품/매장 목록의 「도보 약 N분」 | **추정치** = ⌈ `distanceM` ÷ 67 ⌉ (직선거리 기준, 시속 약 4km). M2 상세에서는 실제 경로 API의 `durationSeconds`를 사용 |
| `event` · `eventLabel` | 할인 유형 배지 「2+1 행사」 | 이 매장의 이 상품 행사 |
| `unitPrice` | 매장 행 오른쪽 「1,000원 개당」 | 5절 계산 결과 |
| `applicableMethods` | 내 할인 수단 아이콘 | 요청 `wallet` 수단 중 **이 매장 브랜드에서 쓸 수 있는 것**. 혜택 큰 순. 프론트는 앞 4개 + 「+N」 |
| `stockStatus` | 재고 배지 + 「예시 데이터」 | 5절 재고 규칙 |

**목록 규칙**

- `stores` = 브랜드마다 반경 안 **가장 가까운 매장 1곳**(최대 4곳). 그 브랜드에 상품이 없거나 반경 안에 매장이 없으면 빠진다
- `stores` 정렬: `unitPrice` 오름차순 → 같으면 `distanceM` 오름차순 → 재고 `OUT` 은 맨 아래
- `products` 정렬: `sort=DISTANCE` 면 가장 가까운 매장의 `distanceM` 오름차순, `sort=PRICE` 면 `minUnitPrice` 오름차순
- `stores` 가 빈 상품은 빼고, 결과가 없으면 `products: []` → 「검색 결과 없음」

### 4-3. `GET /api/stores?x=&y=&radius=` — 주변 편의점 (M1)

| 파라미터 | 필수 | 규칙 |
|---|---|---|
| `x` · `y` | 필수 | 내 위치 |
| `radius` | 선택 | 기본 500, 최대 2000 |

**응답 200** — 거리순

```json
[
  { "storeId": "12345678", "brand": "CU", "placeName": "CU 성수연무장점",
    "x": 127.0571, "y": 37.5431, "distanceM": 240, "walkMin": 4 },
  { "storeId": "87654321", "brand": "GS25", "placeName": "GS25 성수역점",
    "x": 127.0559, "y": 37.5448, "distanceM": 380, "walkMin": 6 }
]
```

- 4사(CU · GS25 · 세븐일레븐 · 이마트24) 매장만. 매장 이름이 4사 이름으로 시작하는지로 판별하고 나머지는 뺀다
- 화면 「주변 편의점 4곳」 = 배열 길이

---

### 4-4. `GET /api/routes/walking` — 실제 도보 경로 조회 (M2) **[신규]**

**목적:** P3에서 선택한 매장을 목적지로 지정하면, 백엔드가 카카오맵 **도보 경로 REST API**를 호출해 실제 보행로 기준 경로·거리·소요시간을 반환한다. 카카오맵 SDK로 경로를 그리는 작업은 프론트엔드가 담당한다.

**요청 예시**

```http
GET /api/routes/walking?startX=127.0563&startY=37.5446&endX=127.0571&endY=37.5431
```

| 파라미터 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `startX` | O | number | 사용자 현재 위치 경도(WGS84, -180~180) |
| `startY` | O | number | 사용자 현재 위치 위도(WGS84, -90~90) |
| `endX` | O | number | 목적지 매장 경도(WGS84, -180~180) |
| `endY` | O | number | 목적지 매장 위도(WGS84, -90~90) |

**응답 200 예시 (가상 경로)**

```json
{
  "distanceM": 410,
  "durationSeconds": 390,
  "path": [
    { "x": 127.0563, "y": 37.5446 },
    { "x": 127.0565, "y": 37.5443 },
    { "x": 127.0570, "y": 37.5437 },
    { "x": 127.0571, "y": 37.5431 }
  ],
  "landingUrl": "https://map.kakao.com/..."
}
```

| 필드 | 타입 | 의미 | 화면 사용처 |
|---|---|---|---|
| `distanceM` | number | 실제 보행 경로 거리(m) | M2 거리 텍스트 |
| `durationSeconds` | number | 실제 보행 예상시간(초) | M2 `Math.ceil(durationSeconds/60)`분 |
| `path` | `{x: number, y: number}[]` | 순서가 있는 경로 좌표(경도/위도, WGS84) | M2 지도 Polyline |
| `landingUrl` | string \| null | 카카오맵 상세 길찾기 링크(있을 때) | 외부 길찾기 버튼(선택) |

**백엔드 처리 규칙**

1. 입력 좌표 유효성을 검사한다.
2. 카카오 공식 REST API `GET https://dapi.kakao.com/v2/routing/walk`를 호출한다. 인증 헤더는 `Authorization: KakaoAK ${REST_API_KEY}`를 사용하고, `start_x`, `start_y`, `end_x`, `end_y`, `input_coord=WGS84`, `output_coord=WGS84`를 전달한다.
3. 카카오 응답 `status=OK`인 경우, `route.properties.totalDistance`와 `totalTime`을 각각 `distanceM`, `durationSeconds`로 변환한다.
4. `route.legs[].steps[].path.points`에 있는 `[x, y]` 좌표들을 **탐색 순서대로 합쳐서** 응답 `path` 객체 배열로 변환한다. 연결점 중복은 제거 가능하나 경로 순서는 유지한다.
5. 카카오 경로 탐색 상태가 `SAME_POINT`이면 거리·시간 0, `path: []`를 반환해 프론트에서 목적지 마커만 표시한다. 나머지 경로 탐색 실패 상태는 `404 ROUTE_NOT_FOUND`로 정규화한다.
6. 도보 경로 API의 쿼터/일시 장애를 고려해 요청 제한 및 짧은 캐싱을 적용할 수 있다. 장애 시 **직선을 실제 도보 경로인 것처럼 표시하지 않는다**.

**오류**

| HTTP | code | 프론트 처리 |
|---|---|---|
| 400 | `INVALID_PARAM` | 좌표 검증 후 재시도 안내 |
| 404 | `ROUTE_NOT_FOUND` | 매장 마커는 표시하고 경로 없음 안내 |
| 429 | `KAKAO_RATE_LIMIT` | 「잠시 뒤 다시 시도해 주세요」 |
| 502 | `KAKAO_ERROR` | 「도보 경로를 불러오지 못했어요」 |

**구현 참고:** [카카오맵 도보 경로 조회 REST API 공식 문서](https://developers.kakao.com/docs/ko/kakaomap/rest-api). 실제 카카오 응답 형식과 본 서비스의 응답 형식은 다르며, 위 JSON은 백엔드에서 정규화한 **우리 서비스의 API 계약**이다. 다른 경로 제공업체를 사용하더라도 이 계약을 유지할 수 있다.

---

## 5. 서버 계산 규칙

### 5-1. 개당 가격 `unitPrice`

화면에 수량 선택이 없으므로 **행사 묶음 한 번 살 때** 기준으로 계산한다.

| 단계 | 규칙 |
|---|---|
| 1. 묶음 | N+1 행사면 묶음 = N+1개, 내는 개수 = N개. 행사 없으면 1개 · 1개 |
| 2. 행사가 | 행사가 = 정가 × 내는 개수 |
| 3. 통신사 할인 | 내 통신사 · 등급 · 매장 브랜드가 맞는 규칙 1개. 행사 상품에 중복 안 되는 규칙이면 0원. 등급 `UNKNOWN` 은 등급 무관 규칙만 |
| 4. 결제 할인 | 내 카드 · 간편결제 중 이 브랜드에서 **할인액이 가장 큰 1개**(결제는 한 수단으로). 기준 = 3단계 뒤 금액. 전월 실적 조건은 **충족한 것으로 본다** |
| 5. 편의점 멤버십 | 적립형은 가격에서 빼지 않는다. 할인형이면 4단계 후보에 같이 넣어 큰 것 1개 |
| 결과 | 결제액 = 행사가 − 통신사 할인 − 결제 할인. **`unitPrice` = ⌊ 결제액 ÷ 묶음 개수 ⌋** |

예: 바나나맛우유 정가 1,500원, 2+1, 할인 없음 → 행사가 1,500 × 2 = 3,000 → 개당 ⌊3,000 ÷ 3⌋ = **1,000원**

카드 직접 입력(`cardId: null`)은 그 카드사 **공통 규칙**만 맞춘다.

### 5-2. 적용 가능 수단 `applicableMethods`

- 요청 `wallet` 의 수단 중 이 매장 **브랜드에 맞는 할인 · 적립 규칙이 하나라도 있으면** 넣는다(이번 상품에 실제로 금액이 빠졌는지와 별개)
- 정렬: 이 상품에서 실제 혜택 금액 큰 순 → 같으면 `TELECOM` · `CARD` · `PAY` · `MEMBERSHIP` 순

### 5-3. 재고 `stockStatus` (예시 데이터)

- 실제 재고 연동 없음. `storeId + ":" + productKey` 문자열 해시를 10으로 나눈 나머지(음수면 양수로): 0~5 = `IN_STOCK`, 6~8 = `LOW`, 9 = `OUT`
- 저장하지 않고 요청마다 같은 규칙으로 계산 → 같은 매장 · 같은 상품은 늘 같은 값
- 화면은 재고 배지 옆에 항상 「예시 데이터」

---

## 6. 서버 없이 프론트가 하는 것

| 기능 | 화면 | 방법 |
|---|---|---|
| 할인 수단 저장 · 수정 · 삭제 | D1 · D2 · D3 · D4 | localStorage 키 `pyeonri.wallet`. 모양은 4-2 요청의 `wallet` 과 같게 |
| 「등록됨」 표시 | D3 | 저장된 `wallet` 과 선택지 비교 |
| 내 위치 | M1 · M3 | 브라우저 Geolocation. 거부 · 실패면 M3 안내, 검색은 기본 좌표(교육장)로 |
| 고른 매장 유지 | P4 · M2 | 프론트 상태(새로고침 시 sessionStorage) |
| 지도 · 마커 | M1 · M2 | 카카오맵 JS SDK |
| 도보 경로 선 | M2 | **`GET /api/routes/walking`의 `path`로 Polyline 표시**. 프론트는 경로 계산을 수행하지 않음 |
| M2 거리·시간 | M2 | 경로 API의 `distanceM`, `durationSeconds`를 표시. P3 목록의 추정 `walkMin`과 구분 |
| 아이콘 최대 4개 + 「+N」 | P3 | `applicableMethods` 앞 4개 |

---

## 7. 프론트엔드 ↔ 백엔드 연동 순서 (시연 흐름)

1. **P1 → P2:** 검색어, 사용자 좌표, 보유 할인 수단을 `POST /api/quotes`로 전송 → 상품 목록과 중첩 매장 목록 표시.
2. **P2 → P3:** 상품 행 클릭 → 응답에 포함된 `stores[]` 펼침(추가 API 호출 없음). 목록의 `walkMin`은 직선거리 추정치.
3. **P3 → M2:** 매장 선택 → `storeId`, `placeName`, `x`, `y`, 선택한 `productKey`와 `unitPrice`를 프론트 상태에 저장 → 지도 화면으로 이동. 사용자 현재 좌표와 매장 좌표로 `GET /api/routes/walking` 호출.
4. **M2:** 지도와 마커는 카카오맵 JS SDK로 표시. 경로 API의 `path`로 Polyline을 그리고, `distanceM`/`durationSeconds`로 거리·시간 표시.
5. **M1:** 지도 탭에 직접 진입할 때 `GET /api/stores`로 주변 4사 매장 마커 표시(현 Figma 기준).
6. **D1~D4:** `GET /api/wallet-options`에서 선택지 조회, 등록 목록은 `localStorage` 저장. 등록 후 다시 상품 검색 시 `wallet` 재전송.

### 연동 검증 기준

- `POST /api/quotes` 응답의 `storeCount`가 실제 `stores.length`와 일치한다.
- 목록에서 240m → 추정 4분, 380m → 추정 6분으로 표시한다. 실제 M2 도보시간은 별도 경로 응답을 사용한다.
- M2에서 선택 매장의 좌표와 경로 끝점이 대체로 일치하며, API `path`를 실제 도보 경로로 표시한다.
- 경로 조회가 실패해도 선택 매장 마커와 상품/가격 정보는 유지하고, 경로와 소요시간의 오류를 안내한다.
- 실제/목업 구분: 행사·재고 등이 예시 데이터일 때 표시를 유지한다. **경로 API 성공값만 실제 보행 경로로 표시한다.**

### 구현 범위 메모

- 이번 개정은 Figma M2의 실제 도보 경로 표시 요구를 명확히 추가한 것이다.
- 새로운 필수 백엔드 엔드포인트는 `GET /api/routes/walking` 하나이며, 기존 API 3개의 주요 응답 구조는 유지했다.
- API 키, CORS, 외부 API 한도는 배포 환경별로 별도 설정한다.
