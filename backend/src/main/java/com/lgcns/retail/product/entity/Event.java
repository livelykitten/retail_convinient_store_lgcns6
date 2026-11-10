package com.lgcns.retail.product.entity;

public enum Event {
    NONE,
    ONE_PLUS_ONE,
    TWO_PLUS_ONE,
    THREE_PLUS_ONE,
    /** 확인되지 않았거나 N+1으로 계산할 수 없는 행사. 행사 할인은 미적용한다. */
    OTHER
}
