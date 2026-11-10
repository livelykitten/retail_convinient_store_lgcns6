package com.lgcns.retail.store.client;

import com.lgcns.retail.common.error.BusinessException;
import com.lgcns.retail.common.error.ErrorCode;

/**
 * 429를 뺀 카카오 오류와 타임아웃. 502 KAKAO_ERROR로 나간다.
 * message는 응답에 그대로 실리므로 화면에 보여도 되는 문구만 넘기고, 상세 원인은 호출한 곳에서 로그로 남긴다.
 */
public class KakaoApiException extends BusinessException {

    public KakaoApiException(String message) {
        super(ErrorCode.KAKAO_ERROR, message);
    }

    public KakaoApiException(String message, Throwable cause) {
        this(message);
        initCause(cause);
    }
}
