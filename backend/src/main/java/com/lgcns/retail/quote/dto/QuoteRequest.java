package com.lgcns.retail.quote.dto;

import com.lgcns.retail.discount.dto.Wallet;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** POST /api/quotes 요청 (API명세최종.md 4-2). 검증에 걸리면 400 INVALID_PARAM */
public record QuoteRequest(
        @NotBlank @Size(max = 30) String q,
        @NotNull @DecimalMin("-180") @DecimalMax("180") Double x,
        @NotNull @DecimalMin("-90") @DecimalMax("90") Double y,
        @Min(1) @Max(2000) Integer radius,
        QuoteSort sort,
        @Valid Wallet wallet
) {

    public static final int DEFAULT_RADIUS = 500;

    public int radiusOrDefault() {
        return radius == null ? DEFAULT_RADIUS : radius;
    }

    public QuoteSort sortOrDefault() {
        return sort == null ? QuoteSort.DISTANCE : sort;
    }

    public Wallet walletOrEmpty() {
        return wallet == null ? Wallet.EMPTY : wallet;
    }
}
