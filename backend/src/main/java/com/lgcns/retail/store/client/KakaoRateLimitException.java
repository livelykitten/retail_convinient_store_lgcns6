package com.lgcns.retail.store.client;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/** 카카오 429. api-spec의 KAKAO_RATE_LIMIT에 해당한다. */
@ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
public class KakaoRateLimitException extends RuntimeException {

    public KakaoRateLimitException() {
        super("잠시 뒤 다시 시도해 주세요");
    }
}
