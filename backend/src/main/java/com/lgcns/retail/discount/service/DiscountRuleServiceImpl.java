package com.lgcns.retail.discount.service;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.dto.MatchedRule;
import com.lgcns.retail.discount.dto.MethodRef;
import com.lgcns.retail.discount.dto.Wallet;
import com.lgcns.retail.discount.entity.DiscountRule;
import com.lgcns.retail.discount.entity.MethodType;
import com.lgcns.retail.discount.entity.Pay;
import com.lgcns.retail.discount.entity.TelecomGrade;
import com.lgcns.retail.discount.repository.DiscountRuleRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사용자 할인 수단 → 맞는 규칙 (erd.md 5-2, 결정 2026-11-09).
 * 좁은 규칙(특정 등급 · 특정 카드 상품)과 넓은 규칙(등급 무관 · 카드사 공통)을 둘 다 후보로 돌려준다.
 * 어느 것을 쓸지(가장 큰 1개)는 계산하는 쪽이 정한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DiscountRuleServiceImpl implements DiscountRuleService {

    private final DiscountRuleRepository discountRuleRepository;

    @Override
    public List<MatchedRule> findFor(Wallet wallet, Brand brand) {
        if (wallet == null || brand == null) {
            return List.of();
        }
        List<DiscountRule> rules = discountRuleRepository.findByBrand(brand);
        List<MatchedRule> matched = new ArrayList<>();

        // 통신사: 내 등급 규칙 + 등급 무관 규칙. 등급 모름(UNKNOWN)은 등급 무관만 (API명세최종.md 5-1 3단계)
        Wallet.TelecomChoice telecom = wallet.telecom();
        if (telecom != null) {
            MethodRef method = new MethodRef(MethodType.TELECOM, telecom.provider().name());
            TelecomGrade grade = telecom.grade() == null ? TelecomGrade.UNKNOWN : telecom.grade();
            for (DiscountRule rule : rules) {
                boolean gradeMatches = rule.getGrade() == null
                        || (grade != TelecomGrade.UNKNOWN && rule.getGrade() == grade);
                if (rule.getType() == MethodType.TELECOM
                        && rule.getProvider().equals(telecom.provider().name())
                        && gradeMatches) {
                    matched.add(MatchedRule.of(rule, method));
                }
            }
        }

        // 카드: 목록에서 고른 카드 = 그 카드 상품 규칙 + 카드사 공통 규칙, 직접 입력 = 카드사 공통 규칙만
        for (Wallet.CardChoice card : wallet.cardsOrEmpty()) {
            String issuer = card.issuer().name();
            String code = card.cardId() != null ? card.cardId() : issuer;
            MethodRef method = new MethodRef(MethodType.CARD, code);
            for (DiscountRule rule : rules) {
                if (rule.getType() != MethodType.CARD) {
                    continue;
                }
                boolean issuerCommon = rule.getCardId() == null && rule.getProvider().equals(issuer);
                boolean thisCard = card.cardId() != null && Objects.equals(rule.getCardId(), card.cardId());
                if (issuerCommon || thisCard) {
                    matched.add(MatchedRule.of(rule, method));
                }
            }
        }

        // 간편결제
        for (Pay pay : wallet.paysOrEmpty()) {
            MethodRef method = new MethodRef(MethodType.PAY, pay.name());
            for (DiscountRule rule : rules) {
                if (rule.getType() == MethodType.PAY && rule.getProvider().equals(pay.name())) {
                    matched.add(MatchedRule.of(rule, method));
                }
            }
        }

        // 편의점 멤버십: 자기 브랜드 매장에서만 (DB CHECK: provider = brand)
        if (wallet.membershipsOrEmpty().contains(brand)) {
            MethodRef method = new MethodRef(MethodType.MEMBERSHIP, brand.name());
            for (DiscountRule rule : rules) {
                if (rule.getType() == MethodType.MEMBERSHIP && rule.getProvider().equals(brand.name())) {
                    matched.add(MatchedRule.of(rule, method));
                }
            }
        }

        return matched;
    }
}
