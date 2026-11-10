package com.lgcns.retail.quote.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.lgcns.retail.discount.dto.MatchedRule;
import com.lgcns.retail.discount.dto.MethodRef;
import com.lgcns.retail.discount.entity.MethodType;
import com.lgcns.retail.discount.entity.RuleKind;
import com.lgcns.retail.product.entity.Event;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** API명세최종.md 5-1 · 5-2 계산 규칙 */
class PriceCalculatorTest {

    private static final MethodRef SKT = new MethodRef(MethodType.TELECOM, "SKT");
    private static final MethodRef DEEP_DREAM = new MethodRef(MethodType.CARD, "shinhan-deepdream-check");
    private static final MethodRef KAKAOPAY = new MethodRef(MethodType.PAY, "KAKAOPAY");
    private static final MethodRef NAVERPAY = new MethodRef(MethodType.PAY, "NAVERPAY");
    private static final MethodRef CU_MEMBERSHIP = new MethodRef(MethodType.MEMBERSHIP, "CU");

    private static MatchedRule rule(MethodRef method, RuleKind kind, String rate, Integer max, Integer minPay,
                                    boolean stack) {
        return new MatchedRule("r-" + method.code(), method, kind, new BigDecimal(rate), max, minPay, stack);
    }

    @Test
    @DisplayName("명세 예시: 바나나맛우유 정가 1,500원, 2+1, 할인 없음 → 행사가 3,000 → 개당 1,000원")
    void specExample() {
        PriceCalculator.Result r = PriceCalculator.calculate(1500, Event.TWO_PLUS_ONE, List.of());

        assertThat(r.bundleQty()).isEqualTo(3);
        assertThat(r.paidQty()).isEqualTo(2);
        assertThat(r.eventPrice()).isEqualTo(3000);
        assertThat(r.unitPrice()).isEqualTo(1000);
        assertThat(r.applicableMethods()).isEmpty();
    }

    @ParameterizedTest(name = "{0}: 정가 {1} → 묶음 {2}개, 개당 {3}원")
    @CsvSource({
            "NONE, 2500, 1, 2500",
            "ONE_PLUS_ONE, 2500, 2, 1250",
            "TWO_PLUS_ONE, 2600, 3, 1733",
            "THREE_PLUS_ONE, 1000, 4, 750"
    })
    @DisplayName("묶음 개수와 개당 가격(원 미만 버림)")
    void bundles(Event event, int listPrice, int bundle, int unit) {
        PriceCalculator.Result r = PriceCalculator.calculate(listPrice, event, List.of());

        assertThat(r.bundleQty()).isEqualTo(bundle);
        assertThat(r.unitPrice()).isEqualTo(unit);
    }

    @Test
    @DisplayName("통신사 할인: 행사 상품에 중복 안 되는 규칙이면 0원, 행사 없으면 적용")
    void telecomNotStackedOnEvent() {
        List<MatchedRule> rules = List.of(rule(SKT, RuleKind.DISCOUNT, "0.100", null, null, false));

        assertThat(PriceCalculator.calculate(1500, Event.TWO_PLUS_ONE, rules).telecomDiscount()).isZero();
        assertThat(PriceCalculator.calculate(1500, Event.NONE, rules).telecomDiscount()).isEqualTo(150);
    }

    @Test
    @DisplayName("통신사 할인은 가장 큰 1개, maxAmount까지")
    void telecomTakesBiggestCapped() {
        List<MatchedRule> rules = List.of(
                rule(SKT, RuleKind.DISCOUNT, "0.050", null, null, true),
                rule(SKT, RuleKind.DISCOUNT, "0.200", 300, null, true));

        PriceCalculator.Result r = PriceCalculator.calculate(3000, Event.NONE, rules);

        assertThat(r.telecomDiscount()).isEqualTo(300); // 0.2 × 3000 = 600 → 최대 300
    }

    @Test
    @DisplayName("결제 할인: 카드 · 간편결제 · 할인형 멤버십 중 가장 큰 1개, 기준은 통신사 할인 뒤 금액")
    void paymentTakesBiggestAfterTelecom() {
        List<MatchedRule> rules = List.of(
                rule(SKT, RuleKind.DISCOUNT, "0.100", null, null, true),
                rule(DEEP_DREAM, RuleKind.DISCOUNT, "0.050", null, null, true),
                rule(KAKAOPAY, RuleKind.DISCOUNT, "0.100", null, null, true),
                rule(CU_MEMBERSHIP, RuleKind.DISCOUNT, "0.030", null, null, true));

        PriceCalculator.Result r = PriceCalculator.calculate(2000, Event.NONE, rules);

        assertThat(r.telecomDiscount()).isEqualTo(200);
        assertThat(r.paymentDiscount()).isEqualTo(180); // (2000 − 200) × 0.1
        assertThat(r.finalPrice()).isEqualTo(1620);
        assertThat(r.unitPrice()).isEqualTo(1620);
    }

    @Test
    @DisplayName("최소 결제액 미만이면 그 규칙은 0원")
    void minPayAmount() {
        List<MatchedRule> rules = List.of(rule(KAKAOPAY, RuleKind.DISCOUNT, "0.100", null, 5000, true));

        assertThat(PriceCalculator.calculate(3000, Event.NONE, rules).paymentDiscount()).isZero();
        assertThat(PriceCalculator.calculate(6000, Event.NONE, rules).paymentDiscount()).isEqualTo(600);
    }

    @Test
    @DisplayName("적립(POINT)은 결제액에서 빼지 않는다")
    void pointIsNotSubtracted() {
        List<MatchedRule> rules = List.of(rule(CU_MEMBERSHIP, RuleKind.POINT, "0.100", null, null, true));

        PriceCalculator.Result r = PriceCalculator.calculate(2000, Event.NONE, rules);

        assertThat(r.unitPrice()).isEqualTo(2000);
        assertThat(r.applicableMethods()).containsExactly(CU_MEMBERSHIP);
    }

    @Test
    @DisplayName("적용 가능 수단: 혜택 큰 순, 같으면 TELECOM · CARD · PAY · MEMBERSHIP 순. 금액이 0이어도 규칙이 있으면 넣는다")
    void applicableMethodsOrder() {
        List<MatchedRule> rules = List.of(
                rule(CU_MEMBERSHIP, RuleKind.POINT, "0.010", null, null, true),     // 20
                rule(NAVERPAY, RuleKind.DISCOUNT, "0.050", null, null, true),       // 100
                rule(KAKAOPAY, RuleKind.DISCOUNT, "0.050", null, null, true),       // 100
                rule(DEEP_DREAM, RuleKind.DISCOUNT, "0.100", null, null, true),     // 200
                rule(SKT, RuleKind.DISCOUNT, "0.100", null, null, false));          // 행사 중복 안 됨 → 0

        PriceCalculator.Result r = PriceCalculator.calculate(1000, Event.ONE_PLUS_ONE, rules);

        assertThat(r.applicableMethods())
                .containsExactly(DEEP_DREAM, NAVERPAY, KAKAOPAY, CU_MEMBERSHIP, SKT);
    }
}
