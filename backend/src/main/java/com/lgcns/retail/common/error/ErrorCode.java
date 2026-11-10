package com.lgcns.retail.common.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    INVALID_PARAM(HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않습니다"),
    // API명세최종.md에 없는 코드. 없는 경로를 500 대신 404로 돌려주려고 둔다 (확인 요망)
    NOT_FOUND(HttpStatus.NOT_FOUND, "요청한 경로를 찾을 수 없습니다"),
    KAKAO_RATE_LIMIT(HttpStatus.TOO_MANY_REQUESTS, "카카오 API 호출 한도를 초과했습니다"),
    KAKAO_ERROR(HttpStatus.BAD_GATEWAY, "카카오 API 호출 중 오류가 발생했습니다"),
    // API명세최종.md 2절의 코드 이름 그대로
    INTERNAL(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getDefaultMessage() {
        return defaultMessage;
    }
}
