package com.lgcns.retail.store.road;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/** 카카오가 경로를 찾지 못한 경우. api-spec의 ROUTE_NOT_FOUND에 해당한다. */
@ResponseStatus(HttpStatus.NOT_FOUND)
public class RouteNotFoundException extends RuntimeException {

    public RouteNotFoundException() {
        super("도보 경로를 찾지 못했어요");
    }
}
