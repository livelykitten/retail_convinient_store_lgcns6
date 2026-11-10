package com.lgcns.retail.common;

/**
 * product · discount_rule 양쪽에서 쓰는 브랜드 값.
 * 외래 키 없이 이 값으로만 두 테이블이 이어진다 (reference/erd.md 2절).
 */
public enum Brand {
    CU,
    GS25,
    SEVEN,
    EMART24
}
