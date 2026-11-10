package com.lgcns.retail.discount.dto;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.entity.CardIssuer;
import com.lgcns.retail.discount.entity.Pay;
import com.lgcns.retail.discount.entity.Telecom;
import com.lgcns.retail.discount.entity.TelecomGrade;
import java.util.List;

/** GET /api/wallet-options 응답 (API명세최종.md 4-1) */
public record WalletOptionsResponse(
        List<TelecomOption> telecoms,
        List<CardOption> cards,
        List<CodeName<CardIssuer>> cardIssuers,
        List<CodeName<Pay>> pays,
        List<MembershipOption> memberships
) {

    public record TelecomOption(Telecom code, String name, List<TelecomGrade> grades) {
    }

    public record CardOption(String cardId, String name, CardIssuer issuer) {
    }

    public record CodeName<T>(T code, String name) {
    }

    public record MembershipOption(Brand brand, String name) {
    }
}
