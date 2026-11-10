package com.lgcns.retail.quote;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.entity.CardIssuer;
import com.lgcns.retail.discount.entity.CardProduct;
import com.lgcns.retail.discount.entity.DiscountRule;
import com.lgcns.retail.discount.entity.MethodType;
import com.lgcns.retail.discount.entity.RuleKind;
import com.lgcns.retail.discount.entity.TelecomGrade;
import com.lgcns.retail.discount.repository.CardProductRepository;
import com.lgcns.retail.discount.repository.DiscountRuleRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * POST /api/quotes · GET /api/wallet-options (API명세최종.md 4-1 · 4-2).
 * 상품 CSV(실데이터)는 계속 바뀌므로, 테스트가 쓰는 상품(펩시콜라 4사)과 할인 규칙은 테스트에서 직접 넣고 되돌린다.
 * 응답에는 실데이터 상품도 섞여 나오므로, 검증은 테스트 상품(productKey)만 골라서 한다.
 * 매장은 FixedNearbyStoreSource. .env에 키가 있어도 실제 카카오 · Claude를 부르지 않도록 키를 비운다.
 */
@SpringBootTest(properties = {"KAKAO_REST_API_KEY=", "claude.api.key="})
@AutoConfigureMockMvc
@Transactional
class QuoteApiTest {

    private static final String KEY = "pepsi-cola-600";
    private static final String TEST_PRODUCT = "$.products[?(@.productKey == '" + KEY + "')]";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private CardProductRepository cardProductRepository;

    @Autowired
    private DiscountRuleRepository discountRuleRepository;

    @BeforeEach
    void seed() {
        // 테스트 상품: 펩시콜라 600ml 4사 (GS25 · CU 1+1 2,500원, 세븐 2+1 2,600원, 이마트24 행사 없음 2,500원)
        jdbcTemplate.update("INSERT INTO product_group (product_key, name, maker, category, size, unit) "
                + "VALUES (?, '펩시콜라600ml', '롯데', 'COLA', 600, 'ML')", KEY);
        insertProduct("gs25-test-1001", "GS25", 2500, "ONE_PLUS_ONE");
        insertProduct("cu-test-1001", "CU", 2500, "ONE_PLUS_ONE");
        insertProduct("seven-test-1001", "SEVEN", 2600, "TWO_PLUS_ONE");
        insertProduct("emart24-test-1001", "EMART24", 2500, "NONE");

        cardProductRepository.save(CardProduct.builder()
                .cardId("shinhan-deepdream-check").name("신한카드 Deep Dream 체크").issuer(CardIssuer.SHINHAN).build());
        discountRuleRepository.saveAll(List.of(
                rule("skt-vip-cu", MethodType.TELECOM, "SKT", TelecomGrade.VIP, null, Brand.CU,
                        RuleKind.DISCOUNT, "0.100", false),
                rule("shinhan-cu", MethodType.CARD, "SHINHAN", null, null, Brand.CU,
                        RuleKind.DISCOUNT, "0.050", true),
                rule("shinhan-deepdream-check-gs25", MethodType.CARD, "SHINHAN", null, "shinhan-deepdream-check",
                        Brand.GS25, RuleKind.DISCOUNT, "0.020", true),
                rule("kakaopay-gs25", MethodType.PAY, "KAKAOPAY", null, null, Brand.GS25,
                        RuleKind.DISCOUNT, "0.100", true),
                rule("cu-membership", MethodType.MEMBERSHIP, "CU", null, null, Brand.CU,
                        RuleKind.POINT, "0.010", true)));
    }

    private void insertProduct(String productId, String brand, int listPrice, String event) {
        jdbcTemplate.update("INSERT INTO product (product_id, product_key, brand, source_name, list_price, event) "
                + "VALUES (?, ?, ?, '펩시콜라600ml', ?, ?)", productId, KEY, brand, listPrice, event);
    }

    private static DiscountRule rule(String id, MethodType type, String provider, TelecomGrade grade, String cardId,
                                     Brand brand, RuleKind kind, String rate, boolean stack) {
        return DiscountRule.builder()
                .ruleId(id).type(type).provider(provider).grade(grade).cardId(cardId).brand(brand)
                .kind(kind).rate(new BigDecimal(rate)).stackWithEvent(stack).requiresPrevMonth(false)
                .build();
    }

    private static final String COLA_NO_WALLET = """
            { "q": "콜라", "x": 127.0161846, "y": 37.5628563 }
            """;

    private static final String COLA_WITH_WALLET = """
            {
              "q": "콜라", "x": 127.0161846, "y": 37.5628563, "radius": 500, "sort": "PRICE",
              "wallet": {
                "telecom": { "provider": "SKT", "grade": "VIP" },
                "cards": [ { "cardId": "shinhan-deepdream-check", "issuer": "SHINHAN" } ],
                "pays": ["KAKAOPAY"],
                "memberships": ["CU"]
              }
            }
            """;

    private String quote(String body) throws Exception {
        return mockMvc.perform(post("/api/quotes").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("콜라"))
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("할인 수단 없이: 펩시콜라 4사, 개당 최저가 1,250원(1+1), 매장 4곳")
    void quoteWithoutWallet() throws Exception {
        String body = quote(COLA_NO_WALLET);

        List<Integer> min = JsonPath.read(body, TEST_PRODUCT + ".minUnitPrice");
        List<Integer> list = JsonPath.read(body, TEST_PRODUCT + ".listPrice");
        List<String> event = JsonPath.read(body, TEST_PRODUCT + ".event");
        List<Integer> storeCount = JsonPath.read(body, TEST_PRODUCT + ".storeCount");
        assertThat(min).containsExactly(1250);
        assertThat(list).containsExactly(2500);
        assertThat(event).containsExactly("ONE_PLUS_ONE");
        assertThat(storeCount).containsExactly(4);

        // stores 정렬: 재고 OUT은 맨 아래, 나머지는 개당 가격 오름차순
        List<Integer> prices = JsonPath.read(body, TEST_PRODUCT + ".stores[*].unitPrice");
        List<String> stocks = JsonPath.read(body, TEST_PRODUCT + ".stores[*].stockStatus");
        List<Integer> inStockPrices = new ArrayList<>();
        boolean seenOut = false;
        for (int i = 0; i < prices.size(); i++) {
            boolean out = stocks.get(i).equals("OUT");
            assertThat(seenOut && !out).as("OUT 뒤에 OUT이 아닌 매장이 오면 안 됨").isFalse();
            seenOut |= out;
            if (!out) {
                inStockPrices.add(prices.get(i));
            }
        }
        assertThat(inStockPrices).isSorted();

        // walkMin = ⌈distanceM ÷ 67⌉
        List<Integer> distances = JsonPath.read(body, TEST_PRODUCT + ".stores[*].distanceM");
        List<Integer> walkMins = JsonPath.read(body, TEST_PRODUCT + ".stores[*].walkMin");
        for (int i = 0; i < distances.size(); i++) {
            assertThat(walkMins.get(i)).isEqualTo((distances.get(i) + 66) / 67);
        }

        // 같은 상품군(COLA)의 실데이터 상품도 함께 나온다
        List<String> categories = JsonPath.read(body, "$.products[*].productKey");
        assertThat(categories).contains(KEY);
    }

    @Test
    @DisplayName("할인 수단 적용: GS25 간편결제 10% → 개당 1,125원이 최저, CU는 통신사(행사 중복 불가) 0원 · 카드사 공통 5%")
    void quoteWithWallet() throws Exception {
        String body = quote(COLA_WITH_WALLET);

        List<Integer> min = JsonPath.read(body, TEST_PRODUCT + ".minUnitPrice");
        assertThat(min).containsExactly(1125);

        // GS25: 행사가 2500, 결제 할인 max(카카오페이 250, 딥드림 50) = 250 → 2250 ÷ 2 = 1125
        List<Integer> gs25 = JsonPath.read(body, TEST_PRODUCT + ".stores[?(@.brand == 'GS25')].unitPrice");
        assertThat(gs25).containsExactly(1125);
        List<String> gs25Methods = JsonPath.read(body,
                TEST_PRODUCT + ".stores[?(@.brand == 'GS25')].applicableMethods[*].code");
        assertThat(gs25Methods).containsExactly("KAKAOPAY", "shinhan-deepdream-check");

        // CU: 통신사 0(행사 중복 불가), 결제 할인 = 카드사 공통 5% 125 → 2375 ÷ 2 = 1187
        List<Integer> cu = JsonPath.read(body, TEST_PRODUCT + ".stores[?(@.brand == 'CU')].unitPrice");
        assertThat(cu).containsExactly(1187);
        List<String> cuMethods = JsonPath.read(body,
                TEST_PRODUCT + ".stores[?(@.brand == 'CU')].applicableMethods[*].type");
        assertThat(cuMethods).containsExactly("CARD", "MEMBERSHIP", "TELECOM");

        // sort=PRICE: products는 minUnitPrice 오름차순
        List<Integer> mins = JsonPath.read(body, "$.products[*].minUnitPrice");
        assertThat(mins).isSorted();
    }

    @Test
    @DisplayName("상품군을 못 찾으면 products는 빈 배열")
    void unknownQuery() throws Exception {
        mockMvc.perform(post("/api/quotes").contentType(MediaType.APPLICATION_JSON)
                        .content("{ \"q\": \"노트북\", \"x\": 127.0, \"y\": 37.5 }"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.products.length()").value(0));
    }

    @Test
    @DisplayName("검색어 없음 · 좌표 없음 · 없는 코드값은 400 INVALID_PARAM")
    void invalidRequests() throws Exception {
        String[] bodies = {
                "{ \"q\": \"\", \"x\": 127.0, \"y\": 37.5 }",
                "{ \"q\": \"콜라\", \"y\": 37.5 }",
                "{ \"q\": \"콜라\", \"x\": 127.0, \"y\": 37.5, \"radius\": 3000 }",
                "{ \"q\": \"콜라\", \"x\": 127.0, \"y\": 37.5, \"wallet\": { \"pays\": [\"XPAY\"] } }"
        };
        for (String body : bodies) {
            mockMvc.perform(post("/api/quotes").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
        }
    }

    @Test
    @DisplayName("wallet-options: 할인 규칙에 있는 것만, 등급은 항상 VIP · NORMAL · UNKNOWN")
    void walletOptions() throws Exception {
        mockMvc.perform(get("/api/wallet-options"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.telecoms.length()").value(1))
                .andExpect(jsonPath("$.telecoms[0].code").value("SKT"))
                .andExpect(jsonPath("$.telecoms[0].grades.length()").value(3))
                // 카드 · 카드사는 할인 규칙 CSV(실데이터)에도 있으므로 순서 대신 포함 여부만 본다
                .andExpect(jsonPath("$.cards[*].cardId").value(org.hamcrest.Matchers.hasItem("shinhan-deepdream-check")))
                .andExpect(jsonPath("$.cardIssuers[?(@.code == 'SHINHAN')].name").value(
                        org.hamcrest.Matchers.hasItem("신한")))
                .andExpect(jsonPath("$.pays[0].code").value("KAKAOPAY"))
                .andExpect(jsonPath("$.memberships[0].brand").value("CU"))
                .andExpect(jsonPath("$.memberships[0].name").value("CU 멤버십"));
    }
}
