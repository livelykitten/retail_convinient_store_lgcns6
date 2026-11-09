-- =====================================================================
-- 4팀 리테일(편리) DB 스키마 (초안 v1.3)
-- 기준: REST API 명세 v1.1 (B 매대 가격표 화면) 만. 요구사항명세서 4절을 바탕으로 한다
-- 문서: docs/reference/erd.md
-- 담당: 함석원 (변경 PR은 이서현 리뷰)
--
-- 앱이 뜰 때마다 CSV로 데이터를 다시 적재하므로, 테이블도 매번 지우고 다시 만든다.
-- enum 칼럼은 VARCHAR + CHECK로 둔다(안). 값을 늘릴 때 CHECK만 고치면 된다.
-- 저장하지 않는 것: 할인 수단(브라우저), 매장(카카오 응답 저장 금지), 재고(해시 계산), 도보 경로(TMAP 응답)
-- =====================================================================

DROP TABLE IF EXISTS discount_rule;
DROP TABLE IF EXISTS card_product;
DROP TABLE IF EXISTS product;
DROP TABLE IF EXISTS product_group;

-- ---------------------------------------------------------------------
-- 상품 묶음: 4사의 같은 상품 하나 (응답 products[] 한 줄)
-- ---------------------------------------------------------------------
CREATE TABLE product_group (
    product_key VARCHAR(60)  NOT NULL,           -- 예) binggrae-banana-240
    name        VARCHAR(100) NOT NULL,           -- 화면에 보이는 정확한 상품명(용량 포함)
    maker       VARCHAR(40),
    category    VARCHAR(30),                     -- 상품군. NULL = 미분류 (FR-08이 갱신)
    size        INT,
    unit        VARCHAR(5),                      -- ML · G
    image_url   VARCHAR(300),                    -- NULL = 프론트 기본 그림

    CONSTRAINT pk_product_group PRIMARY KEY (product_key),
    CONSTRAINT ck_product_group_key       CHECK (REGEXP_LIKE(product_key, '^[a-z0-9]+(-[a-z0-9]+)*$')),
    CONSTRAINT ck_product_group_unit      CHECK (unit IN ('ML', 'G')),
    CONSTRAINT ck_product_group_size_unit CHECK ((size IS NULL AND unit IS NULL) OR (size IS NOT NULL AND unit IS NOT NULL)),
    CONSTRAINT ck_product_group_size      CHECK (size > 0)
);

-- quotes: 검색어 → 상품군 → 상품 묶음
CREATE INDEX ix_product_group_category ON product_group (category);

-- ---------------------------------------------------------------------
-- 브랜드별 상품: 한 브랜드에서 파는 그 상품의 정가 · 행사 (응답 stores[]의 가격 근거)
-- ---------------------------------------------------------------------
CREATE TABLE product (
    product_id  VARCHAR(40)  NOT NULL,           -- 브랜드 소문자 + 원천 번호. 예) cu-45315
    product_key VARCHAR(60)  NOT NULL,           -- 어느 상품 묶음인지
    brand       VARCHAR(10)  NOT NULL,           -- CU · GS25 · SEVEN · EMART24
    source_name VARCHAR(100) NOT NULL,           -- 원천 표기 그대로 (화면 표시는 product_group.name)
    list_price  INT          NOT NULL,           -- 정가(원)
    event       VARCHAR(20)  NOT NULL,           -- NONE · ONE_PLUS_ONE · TWO_PLUS_ONE · THREE_PLUS_ONE

    CONSTRAINT pk_product PRIMARY KEY (product_id),
    CONSTRAINT fk_product_group FOREIGN KEY (product_key) REFERENCES product_group (product_key),
    -- 한 묶음에 브랜드마다 상품은 1개
    CONSTRAINT uk_product_key_brand  UNIQUE (product_key, brand),
    CONSTRAINT ck_product_brand      CHECK (brand IN ('CU', 'GS25', 'SEVEN', 'EMART24')),
    CONSTRAINT ck_product_id_prefix  CHECK (product_id LIKE LOWER(brand) || '-%'),
    CONSTRAINT ck_product_list_price CHECK (list_price > 0),
    CONSTRAINT ck_product_event      CHECK (event IN ('NONE', 'ONE_PLUS_ONE', 'TWO_PLUS_ONE', 'THREE_PLUS_ONE'))
);

-- ---------------------------------------------------------------------
-- 카드 상품: wallet-options cards[] (D3 카드 검색 목록)
-- ---------------------------------------------------------------------
CREATE TABLE card_product (
    card_id VARCHAR(40)  NOT NULL,               -- 예) shinhan-deepdream-check
    name    VARCHAR(60)  NOT NULL,               -- 예) 신한카드 Deep Dream 체크
    issuer  VARCHAR(10)  NOT NULL,               -- 카드사 코드

    CONSTRAINT pk_card_product PRIMARY KEY (card_id),
    CONSTRAINT ck_card_product_id     CHECK (REGEXP_LIKE(card_id, '^[a-z0-9]+(-[a-z0-9]+)*$')),
    CONSTRAINT ck_card_product_issuer CHECK (issuer IN ('SHINHAN', 'KB', 'SAMSUNG', 'HYUNDAI', 'LOTTE', 'WOORI', 'HANA', 'BC', 'NH'))
);

-- ---------------------------------------------------------------------
-- 할인 규칙 (FR-04 · 11, API 5-1 · 5-2). 할인 규칙표 CSV로 적재 (함석원)
-- ---------------------------------------------------------------------
CREATE TABLE discount_rule (
    rule_id             VARCHAR(80)   NOT NULL,  -- 예) skt-vip-cu, shinhan-deepdream-check-cu
    type                VARCHAR(10)   NOT NULL,  -- TELECOM · CARD · PAY · MEMBERSHIP
    provider            VARCHAR(15)   NOT NULL,  -- 통신사 · 카드사 · 간편결제 · 멤버십(브랜드) 코드
    grade               VARCHAR(10),             -- 통신사 등급. NULL = 등급 무관
    card_id             VARCHAR(40),             -- 카드 상품. NULL = 카드사 공통
    brand               VARCHAR(10)   NOT NULL,  -- 적용 브랜드
    kind                VARCHAR(10)   NOT NULL,  -- DISCOUNT(할인) · POINT(적립)
    rate                NUMERIC(4, 3) NOT NULL,  -- 예) 0.100
    max_amount          INT,                     -- 1회 최대 할인 · 적립액. NULL = 한도 없음
    min_pay_amount      INT,                     -- 최소 결제액. NULL = 조건 없음
    stack_with_event    BOOLEAN       NOT NULL,  -- 행사 상품에 중복되나
    requires_prev_month BOOLEAN       NOT NULL,  -- 전월 실적 조건 (API v1.1은 충족으로 보고 계산)
    source              VARCHAR(300),            -- 공지 URL. 규칙 근거 기록용 (API 응답에는 없음)
    checked_at          DATE,                    -- 공지 확인 날짜. 규칙 근거 기록용

    CONSTRAINT pk_discount_rule PRIMARY KEY (rule_id),
    CONSTRAINT fk_discount_rule_card FOREIGN KEY (card_id) REFERENCES card_product (card_id),
    CONSTRAINT ck_discount_rule_type  CHECK (type IN ('TELECOM', 'CARD', 'PAY', 'MEMBERSHIP')),
    CONSTRAINT ck_discount_rule_brand CHECK (brand IN ('CU', 'GS25', 'SEVEN', 'EMART24')),
    CONSTRAINT ck_discount_rule_kind  CHECK (kind IN ('DISCOUNT', 'POINT')),
    -- provider 코드는 종류마다 정해진 값만. 멤버십은 자기 브랜드 매장에서만 맞는다
    CONSTRAINT ck_discount_rule_provider CHECK (
           (type = 'TELECOM'    AND provider IN ('SKT', 'KT', 'LGU'))
        OR (type = 'CARD'       AND provider IN ('SHINHAN', 'KB', 'SAMSUNG', 'HYUNDAI', 'LOTTE', 'WOORI', 'HANA', 'BC', 'NH'))
        OR (type = 'PAY'        AND provider IN ('KAKAOPAY', 'NAVERPAY', 'TOSSPAY', 'SAMSUNGWALLET'))
        OR (type = 'MEMBERSHIP' AND provider = brand)
    ),
    -- 등급은 통신사만. 저장하는 등급은 VIP · NORMAL (UNKNOWN은 사용자 선택값이라 저장하지 않음)
    CONSTRAINT ck_discount_rule_grade CHECK (grade IS NULL OR (type = 'TELECOM' AND grade IN ('VIP', 'NORMAL'))),
    -- 카드 상품은 카드 규칙만
    CONSTRAINT ck_discount_rule_card  CHECK (card_id IS NULL OR type = 'CARD'),
    CONSTRAINT ck_discount_rule_rate  CHECK (rate > 0 AND rate <= 1),
    CONSTRAINT ck_discount_rule_max   CHECK (max_amount > 0),
    CONSTRAINT ck_discount_rule_min   CHECK (min_pay_amount >= 0),
    -- 같은 수단 · 등급 · 카드 상품 · 브랜드 · 종류의 규칙은 1개
    -- grade · card_id가 NULL인 규칙(등급 무관 · 카드사 공통)도 중복을 막으려면 NULLS NOT DISTINCT가 필요하다 (H2 2.x 문법)
    CONSTRAINT uk_discount_rule UNIQUE NULLS NOT DISTINCT (type, provider, grade, card_id, brand, kind)
);

-- quotes: 매장 브랜드별로 규칙을 찾는다
CREATE INDEX ix_discount_rule_brand ON discount_rule (brand);
