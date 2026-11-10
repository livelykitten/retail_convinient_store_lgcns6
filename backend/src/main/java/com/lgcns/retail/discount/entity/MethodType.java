package com.lgcns.retail.discount.entity;

/** 할인 수단 종류 (API명세최종.md 3절). 선언 순서가 applicableMethods의 동점 정렬 순서다. */
public enum MethodType {
    TELECOM,
    CARD,
    PAY,
    MEMBERSHIP
}
