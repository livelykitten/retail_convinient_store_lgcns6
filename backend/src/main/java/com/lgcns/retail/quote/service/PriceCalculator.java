package com.lgcns.retail.quote.service;

import com.lgcns.retail.discount.dto.MatchedRule;
import com.lgcns.retail.discount.dto.MethodRef;
import com.lgcns.retail.discount.entity.MethodType;
import com.lgcns.retail.discount.entity.RuleKind;
import com.lgcns.retail.product.entity.Event;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 개당 가격 계산 (API명세최종.md 5-1)과 적용 가능 수단 (5-2).
 * 상태가 없는 순수 계산이라 단위 테스트로 검증 예시를 그대로 확인한다.
 */
public final class PriceCalculator {

    private PriceCalculator() {
    }

    public record Result(
            int bundleQty,
            int paidQty,
            int eventPrice,
            int telecomDiscount,
            int paymentDiscount,
            int finalPrice,
            int unitPrice,
            List<MethodRef> applicableMethods
    ) {
    }

    public static Result calculate(int listPrice, Event event, List<MatchedRule> rules) {
        // 1. 묶음: N+1 행사면 묶음 N+1개, 내는 개수 N개. 행사 없으면 1개 · 1개
        int bundleQty = bundleQty(event);
        int paidQty = bundleQty == 1 ? 1 : bundleQty - 1;
        boolean isEvent = event != Event.NONE;

        // 2. 행사가 = 정가 × 내는 개수
        int eventPrice = listPrice * paidQty;

        // 3. 통신사 할인: 맞는 규칙 중 가장 큰 1개. 행사 상품에 중복 안 되는 규칙이면 0원
        int telecomDiscount = rules.stream()
                .filter(r -> r.method().type() == MethodType.TELECOM && r.kind() == RuleKind.DISCOUNT)
                .mapToInt(r -> telecomAmount(r, eventPrice, isEvent))
                .max().orElse(0);
        int afterTelecom = eventPrice - telecomDiscount;

        // 4 · 5. 결제 할인: 카드 · 간편결제 · 할인형 멤버십 중 할인액이 가장 큰 1개. 기준 = 3단계 뒤 금액
        int paymentDiscount = rules.stream()
                .filter(r -> r.method().type() != MethodType.TELECOM && r.kind() == RuleKind.DISCOUNT)
                .mapToInt(r -> amount(r, afterTelecom))
                .max().orElse(0);

        // 결과: 결제액 = 행사가 − 통신사 할인 − 결제 할인, 개당 = ⌊결제액 ÷ 묶음 개수⌋
        int finalPrice = afterTelecom - paymentDiscount;
        int unitPrice = Math.floorDiv(finalPrice, bundleQty);

        return new Result(bundleQty, paidQty, eventPrice, telecomDiscount, paymentDiscount,
                finalPrice, unitPrice, applicableMethods(rules, eventPrice, afterTelecom, isEvent));
    }

    static int bundleQty(Event event) {
        return switch (event) {
            case NONE -> 1;
            case ONE_PLUS_ONE -> 2;
            case TWO_PLUS_ONE -> 3;
            case THREE_PLUS_ONE -> 4;
        };
    }

    private static int telecomAmount(MatchedRule rule, int eventPrice, boolean isEvent) {
        if (isEvent && !rule.stackWithEvent()) {
            return 0;
        }
        return amount(rule, eventPrice);
    }

    /** ⌊기준 금액 × rate⌋, maxAmount가 있으면 그 금액까지. 기준 금액이 minPayAmount 미만이면 0 */
    static int amount(MatchedRule rule, int base) {
        if (rule.minPayAmount() != null && base < rule.minPayAmount()) {
            return 0;
        }
        int value = BigDecimal.valueOf(base)
                .multiply(rule.rate())
                .setScale(0, RoundingMode.FLOOR)
                .intValueExact();
        if (rule.maxAmount() != null) {
            value = Math.min(value, rule.maxAmount());
        }
        return value;
    }

    /**
     * 5-2: 이 브랜드에 맞는 할인 · 적립 규칙이 하나라도 있는 수단.
     * 정렬 = 이 상품에서의 혜택 금액 큰 순 → 같으면 TELECOM · CARD · PAY · MEMBERSHIP 순.
     * 혜택 금액 = 그 수단의 규칙 중 가장 큰 할인액 또는 적립액 (결제 수단이 하나뿐이라 가정한 값)
     */
    private static List<MethodRef> applicableMethods(List<MatchedRule> rules, int eventPrice,
                                                     int afterTelecom, boolean isEvent) {
        Map<MethodRef, Integer> benefit = new LinkedHashMap<>();
        for (MatchedRule rule : rules) {
            int value = rule.method().type() == MethodType.TELECOM
                    ? telecomAmount(rule, eventPrice, isEvent)
                    : amount(rule, afterTelecom);
            benefit.merge(rule.method(), value, Math::max);
        }
        return benefit.entrySet().stream()
                .sorted(Comparator.<Map.Entry<MethodRef, Integer>>comparingInt(Map.Entry::getValue).reversed()
                        .thenComparing(e -> e.getKey().type()))
                .map(Map.Entry::getKey)
                .toList();
    }
}
