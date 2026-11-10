package com.lgcns.retail.store.road;

import com.lgcns.retail.common.error.BusinessException;
import com.lgcns.retail.common.error.ErrorCode;

/** 카카오가 경로를 찾지 못한 경우. 404 ROUTE_NOT_FOUND로 나간다. */
public class RouteNotFoundException extends BusinessException {

    public RouteNotFoundException() {
        super(ErrorCode.ROUTE_NOT_FOUND);
    }
}
