package com.lgcns.retail.discount.entity;

/** 카드사 코드와 화면 이름 (API명세최종.md 3절) */
public enum CardIssuer {
    SHINHAN("신한"),
    KB("KB국민"),
    SAMSUNG("삼성"),
    HYUNDAI("현대"),
    LOTTE("롯데"),
    WOORI("우리"),
    HANA("하나"),
    BC("BC"),
    NH("NH농협");

    private final String displayName;

    CardIssuer(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
