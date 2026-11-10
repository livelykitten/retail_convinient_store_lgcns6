package com.lgcns.retail.discount.entity;

import com.lgcns.retail.common.Brand;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 할인 규칙 (erd.md 5-2). 종류별 provider · grade · card_id 규칙은 schema.sql의 CHECK가 강제한다 */
@Entity
@Table(name = "discount_rule")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class DiscountRule {

    @Id
    @Column(name = "rule_id", length = 80)
    private String ruleId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private MethodType type;

    /** TELECOM: 통신사, CARD: 카드사, PAY: 간편결제, MEMBERSHIP: 브랜드 코드 */
    @Column(nullable = false, length = 15)
    private String provider;

    /** 통신사 등급(VIP · NORMAL). NULL = 등급 무관 */
    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    private TelecomGrade grade;

    /** 카드 상품. NULL = 카드사 공통 */
    @Column(name = "card_id", length = 40)
    private String cardId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Brand brand;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private RuleKind kind;

    @Column(nullable = false, precision = 4, scale = 3)
    private BigDecimal rate;

    @Column(name = "max_amount")
    private Integer maxAmount;

    @Column(name = "min_pay_amount")
    private Integer minPayAmount;

    @Column(name = "stack_with_event", nullable = false)
    private boolean stackWithEvent;

    @Column(name = "requires_prev_month", nullable = false)
    private boolean requiresPrevMonth;

    @Column(length = 300)
    private String source;

    @Column(name = "checked_at")
    private LocalDate checkedAt;
}
