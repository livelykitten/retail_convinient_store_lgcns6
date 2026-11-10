> **초안 (함석원).** 할인 규칙표와 카드 상품 목록을 CSV로 만들어 DB(`discount_rule`, `card_product`)에 적재할 때의 형식이에요. 칸 정의와 제약은 [erd.md](erd.md) 3-3 · 3-4와 같아요. `(안)` = 제안값이에요.

# 할인 규칙표 · 카드 상품 CSV 형식

## 1. 파일

| 파일 | 위치 (안) | 들어가는 테이블 | 적재 순서 |
| --- | --- | --- | --- |
| `card_product.csv` | `backend/src/main/resources/data/` | `card_product` | 1 |
| `discount_rule.csv` | `backend/src/main/resources/data/` | `discount_rule` | 2 (`card_id`가 `card_product`를 가리켜서) |

- 앱이 뜰 때마다 두 테이블을 비우고 이 파일로 다시 넣어요.
- 빈 템플릿(헤더만 있음)이 위 위치에 있어요. 예시 행은 이 문서에만 있어요.

## 2. 공통 규칙

| 항목 | 규칙 |
| --- | --- |
| 인코딩 | UTF-8. 엑셀에서 저장하면 맨 앞에 BOM이 붙을 수 있어서, 적재기가 BOM을 지워요 (안) |
| 구분자 | 쉼표(`,`). 값에 쉼표가 있으면 큰따옴표로 감싸요. 예) `"신한카드 Deep Dream, 체크"` |
| 첫 줄 | 헤더. **칸 이름과 순서는 아래 표 그대로** (DB 칸 이름과 같음) |
| 빈 값 | 빈칸 = NULL |
| boolean | `true` · `false` (소문자) |
| 비율 | 소수 3자리까지. 10% = `0.100`, 5% = `0.05` (퍼센트 숫자 `10`으로 쓰지 않아요) |
| 금액 | 원 단위 정수. 쉼표 없이. 예) `5000` |
| 날짜 | `YYYY-MM-DD` |
| 코드값 | 대문자 그대로 (`SKT`, `SHINHAN`, `KAKAOPAY`, `CU` 등). [3절 약칭표](#3-코드값--약칭표) |
| 주석 · 빈 줄 | 넣지 않아요 |

## 3. 코드값 · 약칭표

`rule_id` · `card_id`에는 **코드값의 소문자**를 써요.

| 종류 | 코드값 (`provider` · `issuer` · `brand`) | 약칭 (`rule_id` · `card_id`) | 화면 이름 (Java enum) |
| --- | --- | --- | --- |
| 통신사 | `SKT` · `KT` · `LGU` | `skt` · `kt` · `lgu` | SKT · KT · LG U+ |
| 통신사 등급 | `VIP` · `NORMAL` | `vip` · `normal` | VIP · 일반 |
| 카드사 | `SHINHAN` · `KB` · `SAMSUNG` · `HYUNDAI` · `LOTTE` · `WOORI` · `HANA` · `BC` · `NH` | `shinhan` · `kb` · `samsung` · `hyundai` · `lotte` · `woori` · `hana` · `bc` · `nh` | 신한 · KB국민 · 삼성 · 현대 · 롯데 · 우리 · 하나 · BC · NH농협 |
| 간편결제 | `KAKAOPAY` · `NAVERPAY` · `TOSSPAY` · `SAMSUNGWALLET` | `kakaopay` · `naverpay` · `tosspay` · `samsungwallet` | 카카오페이 · 네이버페이 · 토스페이 · 삼성월렛 |
| 브랜드 · 편의점 멤버십 | `CU` · `GS25` · `SEVEN` · `EMART24` | `cu` · `gs25` · `seven` · `emart24` | CU · GS25 · 세븐일레븐 · 이마트24 (멤버십: CU 멤버십 · GS&POINT · 세븐일레븐 멤버십 · 이마트24 멤버십) |

## 4. `card_product.csv`

```
card_id,name,issuer
```

| 칸 | 필수 | 규칙 |
| --- | --- | --- |
| `card_id` | Y | `<카드사 약칭>-<카드 이름 약칭>`. 영문 소문자 · 숫자 · `-`만. 예) `shinhan-deepdream-check` |
| `name` | Y | 화면에 보이는 카드 상품명. 60자 이내 |
| `issuer` | Y | 카드사 코드 |

카드 이름 약칭은 공식 영문 이름을 소문자로, 체크카드는 끝에 `-check`를 붙여요 (안).

**예시 (형식 설명용)**

```
card_id,name,issuer
shinhan-deepdream-check,신한카드 Deep Dream 체크,SHINHAN
kb-nori2-check,KB국민 노리2 체크,KB
```

## 5. `discount_rule.csv`

```
rule_id,type,provider,grade,card_id,brand,kind,rate,max_amount,min_pay_amount,stack_with_event,requires_prev_month,source,checked_at
```

| 칸 | 필수 | 규칙 |
| --- | --- | --- |
| `rule_id` | Y | 6절 형식 |
| `type` | Y | `TELECOM` · `CARD` · `PAY` · `MEMBERSHIP` |
| `provider` | Y | `TELECOM`: 통신사, `CARD`: 카드사, `PAY`: 간편결제, `MEMBERSHIP`: **`brand`와 같은 값** |
| `grade` | 통신사만 | `VIP` · `NORMAL`. 비우면 등급 무관. 카드 · 간편결제 · 멤버십은 비워요 |
| `card_id` | 카드만 | `card_product.csv`에 있는 값. 비우면 카드사 공통. 카드가 아니면 비워요 |
| `brand` | Y | 적용 브랜드. **브랜드마다 한 줄**이에요 (4사 모두 되는 혜택은 4줄) |
| `kind` | Y | `DISCOUNT`(결제액에서 빠짐) · `POINT`(적립, 결제액에서 안 빠짐) |
| `rate` | Y | 0 초과 1 이하 |
| `max_amount` | | 1회 최대 할인 · 적립액. 비우면 한도 없음 |
| `min_pay_amount` | | 최소 결제액. 비우면 조건 없음 |
| `stack_with_event` | Y | 1+1 · 2+1 같은 행사 상품에도 적용되면 `true` |
| `requires_prev_month` | Y | 전월 실적 조건이 있으면 `true` (계산에서는 충족으로 봐요. 기록용) |
| `source` | | 공지 URL. 근거 기록용 |
| `checked_at` | | 공지를 확인한 날짜 |

**예시 (형식 설명용, 실제 혜택 아님)**

```
rule_id,type,provider,grade,card_id,brand,kind,rate,max_amount,min_pay_amount,stack_with_event,requires_prev_month,source,checked_at
skt-vip-cu,TELECOM,SKT,VIP,,CU,DISCOUNT,0.100,,,false,false,https://example.com/notice,2026-11-09
skt-cu,TELECOM,SKT,,,CU,DISCOUNT,0.050,,,false,false,,
shinhan-deepdream-check-cu,CARD,SHINHAN,,shinhan-deepdream-check,CU,DISCOUNT,0.050,1000,,true,true,,
shinhan-cu,CARD,SHINHAN,,,CU,DISCOUNT,0.030,,5000,true,false,,
kakaopay-gs25,PAY,KAKAOPAY,,,GS25,DISCOUNT,0.020,,,true,false,,
cu-membership,MEMBERSHIP,CU,,,CU,POINT,0.010,,,true,false,,
```

## 6. `rule_id` 형식

| 경우 | 형식 | 예 |
| --- | --- | --- |
| 통신사 등급 규칙 | `<통신사>-<등급>-<브랜드>` | `skt-vip-cu`, `kt-normal-gs25` |
| 통신사 등급 무관 | `<통신사>-<브랜드>` | `lgu-seven` |
| 카드 상품 규칙 | `<card_id>-<브랜드>` | `shinhan-deepdream-check-cu` |
| 카드사 공통 | `<카드사>-<브랜드>` | `shinhan-cu` |
| 간편결제 | `<간편결제>-<브랜드>` | `kakaopay-gs25` |
| 편의점 멤버십 | `<브랜드>-membership` | `cu-membership` |
| 같은 수단 · 브랜드에 적립 규칙이 따로 있음 | 뒤에 `-point` | `shinhan-cu-point`, `cu-membership-point` |

- 영문 소문자 · 숫자 · `-`만, 80자 이내
- 같은 `(type, provider, grade, card_id, brand, kind)`는 한 줄만 있어야 해요 (DB UNIQUE)

## 7. 적재할 때 막히는 경우

DB 제약(erd.md 3-4)에 걸리면 앱이 뜨지 않아요. 적재기는 몇 번째 줄이 왜 틀렸는지 로그로 남겨요 (안).

| 틀린 예 | 걸리는 제약 |
| --- | --- |
| 멤버십 줄의 `provider`(`GS25`)와 `brand`(`CU`)가 다름 | `ck_discount_rule_provider` |
| 카드 줄에 `grade`가 있음 / 통신사 줄에 `grade` = `UNKNOWN` | `ck_discount_rule_grade` |
| 간편결제 줄에 `card_id`가 있음 | `ck_discount_rule_card` |
| `card_id`가 `card_product.csv`에 없음 | `fk_discount_rule_card` |
| `rate`를 `10`(퍼센트)으로 씀 | `ck_discount_rule_rate` |
| 같은 규칙이 두 줄 | `uk_discount_rule` |

## 8. 공지를 옮길 때 주의할 점

| 공지 표현 | 옮기는 법 | 확인할 것 |
| --- | --- | --- |
| "10% 할인" | `rate` = `0.100` | |
| "1,000원당 100원 할인" | `rate` = `0.100` (안) | **계산이 달라질 수 있어요.** 우리 계산은 ⌊결제액 × `rate`⌋라서 1,500원 → 150원인데, 공지대로면 1,000원 단위로 100원(1,500원 → 100원)이에요. 이런 혜택이 많으면 계산 규칙에 "단위 금액" 칸을 더할지 정해야 해요 (함석원) |
| "최대 3,000원" | `max_amount` = `3000` | |
| "5,000원 이상 결제 시" | `min_pay_amount` = `5000` | |
| "행사 상품 제외" | `stack_with_event` = `false` | |
| "전월 30만 원 이상 사용 시" | `requires_prev_month` = `true` | 금액은 기록하지 않아요 (계산에서 충족으로 봄) |
| "적립" · "포인트" | `kind` = `POINT` | |
| 정액 할인 ("1,000원 할인") | **지금 칸으로는 표현할 수 없어요** | 이런 혜택이 있으면 `amount` 칸을 더할지 정해야 해요 (함석원) |
