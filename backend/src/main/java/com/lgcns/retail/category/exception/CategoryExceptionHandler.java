package com.lgcns.retail.category.exception;

import com.lgcns.retail.category.dto.ErrorResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

/**
 * category 모듈의 400 INVALID_PARAM 처리.
 * 그 밖의 예외(500)는 공통 GlobalExceptionHandler(PR #8)가 처리한다. 여기서 Exception을 잡으면
 * 내부 메시지가 응답에 나가고, 공통 처리와 겹쳐 어느 쪽이 처리할지 불분명해진다.
 * PR #8 병합 후에는 common의 BusinessException(ErrorCode.INVALID_PARAM)으로 옮기고 이 클래스는 지운다.
 */
@RestControllerAdvice(basePackages = "com.lgcns.retail.category")
public class CategoryExceptionHandler {

    @ExceptionHandler(InvalidParamException.class)
    public ResponseEntity<ErrorResponse> handleInvalidParamException(InvalidParamException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("INVALID_PARAM", e.getMessage()));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingParameter(MissingServletRequestParameterException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("INVALID_PARAM", "파라미터 '" + e.getParameterName() + "'는 필수입니다."));
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(HandlerMethodValidationException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ErrorResponse("INVALID_PARAM", "요청 파라미터가 유효하지 않습니다."));
    }
}
