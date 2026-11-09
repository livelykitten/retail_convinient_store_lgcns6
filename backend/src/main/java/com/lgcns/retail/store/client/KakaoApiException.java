package com.lgcns.retail.store.client;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/** 429를 뺀 카카오 오류와 타임아웃. api-spec의 KAKAO_ERROR에 해당한다. */
@ResponseStatus(HttpStatus.BAD_GATEWAY)
public class KakaoApiException extends RuntimeException {

    public KakaoApiException(String message) {
        super(message);
    }

    public KakaoApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
