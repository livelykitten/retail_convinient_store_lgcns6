package com.lgcns.retail.discount.dto;

import com.lgcns.retail.discount.entity.DiscountRule;
import com.lgcns.retail.discount.entity.RuleKind;
import java.math.BigDecimal;

/** 사용자 할인 수단에 맞는 할인 규칙 하나. 모듈 밖으로 내보내는 DTO (엔티티를 내보내지 않음) */
public record MatchedRule(
        String ruleId,
        MethodRef method,
        RuleKind kind,
        BigDecimal rate,
        Integer maxAmount,
        Integer minPayAmount,
        boolean stackWithEvent
) {

    public static MatchedRule of(DiscountRule rule, MethodRef method) {
        return new MatchedRule(rule.getRuleId(), method, rule.getKind(), rule.getRate(),
                rule.getMaxAmount(), rule.getMinPayAmount(), rule.isStackWithEvent());
    }
}
