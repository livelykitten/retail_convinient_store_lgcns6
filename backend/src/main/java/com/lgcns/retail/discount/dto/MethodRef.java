package com.lgcns.retail.discount.dto;

import com.lgcns.retail.discount.entity.MethodType;

/**
 * 사용자 할인 수단 하나. applicableMethods[] 원소와 같은 모양 (API명세최종.md 4-2).
 * code: TELECOM = 통신사, CARD = cardId (직접 입력한 카드는 카드사 코드), PAY = 간편결제, MEMBERSHIP = 브랜드
 */
public record MethodRef(MethodType type, String code) {
}
