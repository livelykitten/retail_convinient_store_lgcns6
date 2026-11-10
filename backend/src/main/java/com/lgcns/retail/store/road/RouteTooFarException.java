package com.lgcns.retail.store.road;

import com.lgcns.retail.common.error.BusinessException;
import com.lgcns.retail.common.error.ErrorCode;

/** 출발지와 도착지가 너무 멀어 카카오를 호출하지 않는 경우. 400 INVALID_PARAM으로 나간다. */
public class RouteTooFarException extends BusinessException {

    public RouteTooFarException() {
        super(ErrorCode.INVALID_PARAM, "출발지와 도착지가 2000m를 넘어요");
    }
}
