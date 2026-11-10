package com.lgcns.retail.discount.entity;

/** 간편결제 코드와 화면 이름 (API명세최종.md 3절) */
public enum Pay {
    KAKAOPAY("카카오페이"),
    NAVERPAY("네이버페이"),
    TOSSPAY("토스페이"),
    SAMSUNGWALLET("삼성월렛");

    private final String displayName;

    Pay(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
