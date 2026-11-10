package com.lgcns.retail.store.road;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/** 출발지와 도착지가 너무 멀어 카카오를 호출하지 않는 경우. api-spec의 INVALID_PARAM에 해당한다. */
@ResponseStatus(HttpStatus.BAD_REQUEST)
public class RouteTooFarException extends RuntimeException {

    public RouteTooFarException() {
        super("출발지와 도착지가 2000m를 넘어요");
    }
}