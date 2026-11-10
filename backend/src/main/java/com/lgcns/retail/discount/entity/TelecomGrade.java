package com.lgcns.retail.discount.entity;

/** 통신사 등급. UNKNOWN(모름)은 사용자 선택값이라 DB에는 저장하지 않는다 (DB의 NULL = 등급 무관) */
public enum TelecomGrade {
    VIP,
    NORMAL,
    UNKNOWN
}
