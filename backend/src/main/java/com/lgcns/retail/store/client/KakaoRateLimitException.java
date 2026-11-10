package com.lgcns.retail.store.client;

import com.lgcns.retail.common.error.BusinessException;
import com.lgcns.retail.common.error.ErrorCode;

/** 카카오 429. 429 KAKAO_RATE_LIMIT으로 나간다. */
public class KakaoRateLimitException extends BusinessException {

    public KakaoRateLimitException() {
        super(ErrorCode.KAKAO_RATE_LIMIT, "잠시 뒤 다시 시도해 주세요");
    }
}
