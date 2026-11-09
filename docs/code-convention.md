# 코드 규칙

애플리케이션 하나를 네 명이 나눠 만들기 때문에, 어느 모듈을 열어도 같은 자리에 같은 이름이 있도록 맞춰요.

> **기본값 표시.** `(안)`이 붙은 항목은 백엔드 리드(이서현)가 스프린트 0에 골격을 만들면서 최종 결정해요. 바뀌면 이 문서를 먼저 고쳐요.

## 패키지 구조

패키지 루트는 `com.lgcns.retail`이에요. 모듈마다 패키지 하나, 그 안은 역할별로 나눠요. (안)

```
backend/src/main/java/com/lgcns/retail/
├─ RetailApplication.java
├─ common/                      # 이서현
│  ├─ config/                   # CORS, 공통 설정
│  ├─ error/                    # ErrorCode, BusinessException, 전역 예외 처리
│  └─ loader/                   # 시작 시 CSV 적재
├─ product/                     # 이서현
│  ├─ controller/
│  ├─ service/                  # ProductService (다른 모듈에 공개)
│  ├─ repository/
│  ├─ entity/
│  └─ dto/
├─ discount/                    # 함석원 (DiscountRuleService, wallet-options)
├─ quote/                       # 함석원 (POST /api/quotes, 계산)
├─ store/                       # 노건우 (StoreService, StockService, 카카오 클라이언트)
└─ category/                    # 한예림 (CategoryResolver, 키워드 사전, AI 클라이언트)

backend/src/main/resources/
├─ application.properties
├─ schema.sql                   # 함석원
└─ data/                        # CSV 등 적재 원천 (이서현 · 한예림)
```

- 각 모듈 안의 하위 패키지(`controller` · `service` · `repository` · `entity` · `dto`)는 `product`와 같은 모양으로 맞춰요. 필요 없는 것은 만들지 않아요.
- **다른 모듈은 `service` 패키지의 공개 메서드만 불러요.** 다른 모듈의 `repository` · `entity`를 import 하지 않아요.
- 다른 모듈에 넘기는 값은 `dto`로 만들어요. 엔티티를 모듈 밖으로 내보내지 않아요.

## 이름

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 컨트롤러 | `<도메인>Controller` | `QuoteController`, `StoreController` |
| 서비스 | `<도메인>Service` | `ProductService`, `DiscountRuleService` |
| 리포지토리 | `<엔티티>Repository` | `ProductRepository` |
| 엔티티 | 테이블 이름의 PascalCase | `Product`, `DiscountRule` |
| 요청 · 응답 DTO | `<무엇>Request`, `<무엇>Response` (안) | `QuoteRequest`, `QuoteResponse` |
| 모듈 간 DTO | 도메인 이름 그대로 (안) | `Store`, `ProductDto` (엔티티와 이름이 겹치면 `Dto`) |
| 외부 API 클라이언트 | `<상대>Client` | `KakaoLocalClient`, `LlmClient` |
| enum | 값은 명세 그대로 `UPPER_SNAKE_CASE` | `Brand.EMART24`, `Event.ONE_PLUS_ONE` |
| 상수 | `UPPER_SNAKE_CASE` | `MAX_RADIUS` |
| 테이블 · 칼럼 | 소문자 스네이크, 단수형 | `discount_rule.min_pay_amount` |
| JSON 필드 | camelCase. **명세에서 복사해요** | `minPayAmount`, `distanceM` |

- 필드 이름과 enum 값은 [reference/api-spec.md](reference/api-spec.md), [reference/erd.md](reference/erd.md)에서 그대로 복사해요. 비슷한 이름을 새로 짓지 않아요.

## API

- **경로, 메서드, 요청 · 응답 필드는 [reference/api-spec.md](reference/api-spec.md)와 똑같이 만들어요.** 바꿔야 하면 [스펙 변경](CONTRIBUTING.md#스펙-변경) 순서를 따라요.
- 요청 검증은 Bean Validation(`@NotNull`, `@Size`, `@Min`, `@Max`)으로 해요. 실패하면 공통 예외 처리가 400 `INVALID_PARAM`으로 바꿔요.
- 컨트롤러는 요청을 받고 서비스를 부르는 일만 해요. 계산 · 판별 로직은 서비스에 둬요.
- 스프린트 0에는 각자 API가 **고정 응답**을 돌려주게 먼저 올려요. 프런트가 바로 붙을 수 있어요.

```java
@RestController
@Validated // @RequestParam의 @Max 검사를 켠다
@RequiredArgsConstructor
@RequestMapping("/api/stores")
public class StoreController {
    private final StoreService storeService;

    @GetMapping
    public List<Store> findNearby(
            @RequestParam double x,
            @RequestParam double y,
            @RequestParam(defaultValue = "500") @Max(2000) int radius) {
        return storeService.findNearby(x, y, radius);
    }
}
```

### 오류 응답

- 형식은 `{ "code", "message" }` 하나예요. 스택 트레이스를 응답에 싣지 않아요.
- `common/error`에 `ErrorCode` enum(상태 · code · 기본 문구)과 `BusinessException`을 두고, `@RestControllerAdvice` 하나가 모든 예외를 이 형식으로 바꿔요 (안, 이서현).
- 모듈에서 오류를 낼 때는 `throw new BusinessException(ErrorCode.KAKAO_RATE_LIMIT)`처럼 써요. 컨트롤러에서 `ResponseEntity`로 오류를 직접 만들지 않아요.

| 상황 | HTTP | code |
| --- | --- | --- |
| 입력값이 틀림 | 400 | `INVALID_PARAM` |
| 카카오 429 | 429 | `KAKAO_RATE_LIMIT` |
| 카카오 그 밖의 오류 | 502 | `KAKAO_ERROR` |
| 예상하지 못한 오류 | 500 | `INTERNAL_ERROR` (안) |

- 새 code가 필요하면 [스펙 변경](CONTRIBUTING.md#스펙-변경)으로 명세에 먼저 넣어요.

## 계산 (quote · discount)

- 금액은 원 단위 정수로 다뤄요. `rate`를 곱할 때만 `BigDecimal`을 쓰고, 버림은 `RoundingMode.FLOOR`예요. `double`로 금액을 계산하지 않아요.
- 4단계(행사 → 통신사 → 결제 → 적립)는 단계마다 메서드를 나눠서 단계별로 테스트할 수 있게 해요 (안).
- 계산 규칙의 원문은 [reference/requirements.md 2절](reference/requirements.md#2-최종-결제액-계산-규칙-fr-04)이에요. 규칙을 코드로 옮길 때 해석이 갈리면 추측하지 말고 PM2(민경완)에게 물어요.

## 외부 API (store · category)

- 키는 `application.properties`에 `${KAKAO_REST_API_KEY}`처럼 환경 변수 이름만 적어요.
- HTTP 클라이언트는 Spring의 `RestClient`를 써요 (안). 타임아웃을 꼭 정해요 (안: 연결 2초, 읽기 3초. FR-05 3초 안 응답).
- 카카오 응답은 메모리에서만 쓰고 DB · 파일에 저장하지 않아요.
- 외부 API 오류는 클라이언트 클래스에서 우리 예외(`BusinessException` 또는 모듈 예외)로 바꿔서 던져요. 다른 모듈에 외부 라이브러리 예외가 새어 나가지 않게 해요.

## DB · JPA

- 테이블은 `schema.sql`로 만들고, JPA는 확인만 해요: `spring.jpa.hibernate.ddl-auto=validate` (안). 엔티티와 SQL이 다르면 앱이 뜨지 않아서 바로 알 수 있어요.
- 엔티티를 바꾸면 **같은 PR에서** `schema.sql`과 [reference/erd.md](reference/erd.md)도 고쳐요. 스키마 변경 PR은 이서현이 리뷰해요.
- enum 칼럼은 `@Enumerated(EnumType.STRING)`으로 저장해요. `ORDINAL`은 쓰지 않아요.
- 조회만 하는 서비스 메서드에는 `@Transactional(readOnly = true)`를 달아요.
- 다른 모듈의 테이블은 그 모듈의 서비스로 읽어요. 리포지토리를 가져다 쓰지 않아요.

## 설정

- 설정 파일은 `backend/src/main/resources/application.properties` 하나로 시작해요. 프로필은 필요해지면 나눠요 (안).
- 비밀 값(카카오 · AI 키)은 환경 변수로만 받아요. 설정 파일 · 코드 · 테스트에 값을 쓰지 않아요.
- H2 콘솔은 로컬 확인용으로 켜 둬도 돼요. 주소와 계정은 비밀 값이 아니지만 시연 환경에서는 꺼요 (안).

## 로그

- `System.out.println`을 쓰지 않아요. Lombok의 `@Slf4j`를 써요.
- API 키는 로그에 남기지 않아요. 카카오 · LLM 요청 URL을 남길 때 키가 들어가지 않는지 확인해요.
- 레벨: 정상 흐름의 주요 지점(적재 건수, 외부 API 호출 시간)은 `info`, 예상한 실패(400, 카카오 429)는 `warn`, 예상하지 못한 실패는 `error`와 예외를 함께 남겨요.

## 코드 모양

- 들여쓰기는 스페이스 4칸, 한 줄 120자 안쪽 (안: IntelliJ 기본 포매터). 자동 포매터(Spotless 등) 도입은 미정(백엔드 리드)이에요.
- import는 `*`로 묶지 않아요.
- Lombok은 `@Getter`, `@RequiredArgsConstructor`, `@Builder`, `@Slf4j`를 써요. 엔티티에는 `@Setter`와 `@Data`를 쓰지 않아요.
- 의존성 주입은 생성자 주입(`@RequiredArgsConstructor` + `private final`)만 써요.
- 주석은 "왜"를 적어요. 코드를 그대로 읽어 주는 주석은 달지 않아요. 계산 규칙을 옮긴 곳에는 명세 절 번호를 적어요. 예) `// 명세 2절 2단계: 행사 상품 중복 불가`

## 테스트

- `cd backend && ./gradlew test`가 카카오 · AI 키 없이 돌아가야 해요. 외부 API를 실제로 부르는 테스트는 기본 실행에서 빼요.
- 최소한 아래는 테스트를 둬요.

| 대상 | 테스트 | 담당 |
| --- | --- | --- |
| 결제액 계산 | 검증 예시(류지범 손계산)를 모두 단위 테스트로. 단계별 경계값(`maxAmount`, `minPayAmount`, 전월 실적) | 함석원 |
| 재고 더미 | 같은 `storeId` · `productId`는 항상 같은 값, 0 · 5 · 6 · 8 · 9 경계 | 노건우 |
| 브랜드 판별 | `place_name` 4사 시작어, 그 밖의 편의점 제외 | 노건우 |
| 정렬 | `finalPrice` → `distanceM`, `OUT` 맨 아래 | 함석원 |
| 검색어 → 상품군 | 키워드 사전으로 정답셋 실행, `q` 길이 검증 | 한예림 |
| CSV 적재 | 적재 뒤 상품군별 4사 각 10개 이상 | 이서현 |
| 컨트롤러 | `@WebMvcTest`로 경로 · 응답 필드 · 400 형식 확인 | 각 API 담당 |

- 테스트 이름은 한국어로 써도 돼요. `@DisplayName("GS25 1+1 상품은 KT VIP 할인이 적용되지 않는다")`
