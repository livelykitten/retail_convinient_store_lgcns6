package com.lgcns.retail.discount.service;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.dto.WalletOptionsResponse;
import com.lgcns.retail.discount.dto.WalletOptionsResponse.CardOption;
import com.lgcns.retail.discount.dto.WalletOptionsResponse.CodeName;
import com.lgcns.retail.discount.dto.WalletOptionsResponse.MembershipOption;
import com.lgcns.retail.discount.dto.WalletOptionsResponse.TelecomOption;
import com.lgcns.retail.discount.entity.CardIssuer;
import com.lgcns.retail.discount.entity.CardProduct;
import com.lgcns.retail.discount.entity.DiscountRule;
import com.lgcns.retail.discount.entity.MethodType;
import com.lgcns.retail.discount.entity.Pay;
import com.lgcns.retail.discount.entity.Telecom;
import com.lgcns.retail.discount.entity.TelecomGrade;
import com.lgcns.retail.discount.repository.CardProductRepository;
import com.lgcns.retail.discount.repository.DiscountRuleRepository;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** GET /api/wallet-options: 서버 할인 규칙에 있는 것만 내려준다 (API명세최종.md 4-1, FR-11) */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WalletOptionsService {

    // 편의점 멤버십 화면 이름 (API명세최종.md 4-1 예시)
    private static final Map<Brand, String> MEMBERSHIP_NAMES = Map.of(
            Brand.CU, "CU 멤버십",
            Brand.GS25, "GS&POINT",
            Brand.SEVEN, "세븐일레븐 멤버십",
            Brand.EMART24, "이마트24 멤버십");

    // 등급 칩은 규칙과 상관없이 항상 세 개 (VIP · 일반 · 모름)
    private static final List<TelecomGrade> ALL_GRADES = List.of(TelecomGrade.values());

    private final DiscountRuleRepository discountRuleRepository;
    private final CardProductRepository cardProductRepository;

    public WalletOptionsResponse getOptions() {
        List<DiscountRule> rules = discountRuleRepository.findAll();

        Set<String> telecomCodes = providersOf(rules, MethodType.TELECOM);
        Set<String> issuerCodes = providersOf(rules, MethodType.CARD);
        Set<String> payCodes = providersOf(rules, MethodType.PAY);
        Set<String> membershipCodes = providersOf(rules, MethodType.MEMBERSHIP);
        Set<String> cardIdsWithRule = rules.stream()
                .map(DiscountRule::getCardId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // 순서는 API명세최종.md 3절 코드값 순서
        List<TelecomOption> telecoms = Arrays.stream(Telecom.values())
                .filter(t -> telecomCodes.contains(t.name()))
                .map(t -> new TelecomOption(t, t.getDisplayName(), ALL_GRADES))
                .toList();

        // 카드 상품은 규칙이 하나라도 있는 것만 (안). 이름순
        List<CardOption> cards = cardProductRepository.findAll().stream()
                .filter(c -> cardIdsWithRule.contains(c.getCardId()))
                .sorted(Comparator.comparing(CardProduct::getName))
                .map(c -> new CardOption(c.getCardId(), c.getName(), c.getIssuer()))
                .toList();

        List<CodeName<CardIssuer>> cardIssuers = Arrays.stream(CardIssuer.values())
                .filter(i -> issuerCodes.contains(i.name()))
                .map(i -> new CodeName<>(i, i.getDisplayName()))
                .toList();

        List<CodeName<Pay>> pays = Arrays.stream(Pay.values())
                .filter(p -> payCodes.contains(p.name()))
                .map(p -> new CodeName<>(p, p.getDisplayName()))
                .toList();

        List<MembershipOption> memberships = Arrays.stream(Brand.values())
                .filter(b -> membershipCodes.contains(b.name()))
                .map(b -> new MembershipOption(b, MEMBERSHIP_NAMES.get(b)))
                .toList();

        return new WalletOptionsResponse(telecoms, cards, cardIssuers, pays, memberships);
    }

    private static Set<String> providersOf(List<DiscountRule> rules, MethodType type) {
        return rules.stream()
                .filter(r -> r.getType() == type)
                .map(DiscountRule::getProvider)
                .collect(Collectors.toSet());
    }
}
