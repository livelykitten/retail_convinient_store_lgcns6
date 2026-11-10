package com.lgcns.retail.discount.entity;

/** 통신사 코드와 화면 이름 (API명세최종.md 3절) */
public enum Telecom {
    SKT("SKT"),
    KT("KT"),
    LGU("LG U+");

    private final String displayName;

    Telecom(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }
}
