package com.lgcns.retail.discount.dto;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.entity.CardIssuer;
import com.lgcns.retail.discount.entity.Pay;
import com.lgcns.retail.discount.entity.Telecom;
import com.lgcns.retail.discount.entity.TelecomGrade;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * 사용자 할인 수단 (API명세최종.md 4-2 요청의 wallet). 서버에 저장하지 않는다.
 * 코드값이 3절 목록에 없으면 JSON 변환 단계에서 400 INVALID_PARAM이 된다.
 */
public record Wallet(
        @Valid TelecomChoice telecom,
        List<@Valid @NotNull CardChoice> cards,
        List<@NotNull Pay> pays,
        List<@NotNull Brand> memberships
) {

    public static final Wallet EMPTY = new Wallet(null, List.of(), List.of(), List.of());

    public List<CardChoice> cardsOrEmpty() {
        return cards == null ? List.of() : cards;
    }

    public List<Pay> paysOrEmpty() {
        return pays == null ? List.of() : pays;
    }

    public List<Brand> membershipsOrEmpty() {
        return memberships == null ? List.of() : memberships;
    }

    public record TelecomChoice(@NotNull Telecom provider, TelecomGrade grade) {
    }

    /** 목록에서 고른 카드 = cardId + issuer, 직접 입력한 카드 = cardId null + name + issuer */
    public record CardChoice(String cardId, String name, @NotNull CardIssuer issuer) {
    }
}
