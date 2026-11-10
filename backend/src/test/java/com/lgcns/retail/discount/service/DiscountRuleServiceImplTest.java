package com.lgcns.retail.discount.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.dto.MatchedRule;
import com.lgcns.retail.discount.dto.Wallet;
import com.lgcns.retail.discount.entity.CardIssuer;
import com.lgcns.retail.discount.entity.DiscountRule;
import com.lgcns.retail.discount.entity.MethodType;
import com.lgcns.retail.discount.entity.Pay;
import com.lgcns.retail.discount.entity.RuleKind;
import com.lgcns.retail.discount.entity.Telecom;
import com.lgcns.retail.discount.entity.TelecomGrade;
import com.lgcns.retail.discount.repository.DiscountRuleRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 규칙 찾는 법 (erd.md 5-2, API명세최종.md 5-1) */
class DiscountRuleServiceImplTest {

    private final DiscountRuleRepository repository = mock(DiscountRuleRepository.class);
    private final DiscountRuleService service = new DiscountRuleServiceImpl(repository);

    @BeforeEach
    void rulesAtCu() {
        when(repository.findByBrand(Brand.CU)).thenReturn(List.of(
                rule("skt-vip-cu", MethodType.TELECOM, "SKT", TelecomGrade.VIP, null),
                rule("skt-cu", MethodType.TELECOM, "SKT", null, null),
                rule("kt-cu", MethodType.TELECOM, "KT", null, null),
                rule("shinhan-deepdream-check-cu", MethodType.CARD, "SHINHAN", null, "shinhan-deepdream-check"),
                rule("shinhan-cu", MethodType.CARD, "SHINHAN", null, null),
                rule("woori-cu", MethodType.CARD, "WOORI", null, null),
                rule("kakaopay-cu", MethodType.PAY, "KAKAOPAY", null, null),
                rule("cu-membership", MethodType.MEMBERSHIP, "CU", null, null)));
    }

    private static DiscountRule rule(String id, MethodType type, String provider, TelecomGrade grade, String cardId) {
        return DiscountRule.builder()
                .ruleId(id).type(type).provider(provider).grade(grade).cardId(cardId).brand(Brand.CU)
                .kind(RuleKind.DISCOUNT).rate(new BigDecimal("0.050")).stackWithEvent(true).requiresPrevMonth(false)
                .build();
    }

    private List<String> ruleIds(Wallet wallet) {
        return service.findFor(wallet, Brand.CU).stream().map(MatchedRule::ruleId).toList();
    }

    @Test
    @DisplayName("통신사 VIP = VIP 규칙 + 등급 무관 규칙, 모름(UNKNOWN) = 등급 무관 규칙만")
    void telecomGrades() {
        Wallet vip = new Wallet(new Wallet.TelecomChoice(Telecom.SKT, TelecomGrade.VIP), null, null, null);
        Wallet unknown = new Wallet(new Wallet.TelecomChoice(Telecom.SKT, TelecomGrade.UNKNOWN), null, null, null);
        Wallet normal = new Wallet(new Wallet.TelecomChoice(Telecom.SKT, TelecomGrade.NORMAL), null, null, null);

        assertThat(ruleIds(vip)).containsExactly("skt-vip-cu", "skt-cu");
        assertThat(ruleIds(unknown)).containsExactly("skt-cu");
        assertThat(ruleIds(normal)).containsExactly("skt-cu");
    }

    @Test
    @DisplayName("목록에서 고른 카드 = 카드 상품 규칙 + 카드사 공통, 직접 입력한 카드 = 카드사 공통만 (code는 카드사)")
    void cards() {
        Wallet listed = new Wallet(null,
                List.of(new Wallet.CardChoice("shinhan-deepdream-check", null, CardIssuer.SHINHAN)), null, null);
        Wallet typed = new Wallet(null,
                List.of(new Wallet.CardChoice(null, "우리카드 카드의정석 체크", CardIssuer.WOORI)), null, null);

        assertThat(ruleIds(listed)).containsExactly("shinhan-deepdream-check-cu", "shinhan-cu");
        assertThat(service.findFor(typed, Brand.CU))
                .extracting(m -> m.ruleId() + "/" + m.method().code())
                .containsExactly("woori-cu/WOORI");
    }

    @Test
    @DisplayName("멤버십은 자기 브랜드 매장에서만, 간편결제는 코드가 같은 규칙")
    void membershipAndPay() {
        Wallet wallet = new Wallet(null, null, List.of(Pay.KAKAOPAY, Pay.NAVERPAY), List.of(Brand.CU, Brand.GS25));

        assertThat(ruleIds(wallet)).containsExactly("kakaopay-cu", "cu-membership");
    }

    @Test
    @DisplayName("할인 수단이 없으면 규칙도 없다")
    void emptyWallet() {
        assertThat(service.findFor(Wallet.EMPTY, Brand.CU)).isEmpty();
    }
}
