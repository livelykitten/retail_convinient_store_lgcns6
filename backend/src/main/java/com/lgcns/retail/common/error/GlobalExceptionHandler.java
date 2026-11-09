package com.lgcns.retail.common.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice 
public class GlobalExceptionHandler {

    @ExceptionHandler (BusinessException.class)
    public ResponseEntity<ApiError> handleBusinessException(BusinessException e) {
        ErrorCode errorCode = e.getErrorCode();
        return ResponseEntity.status(errorCode.getStatus())
                .body(new ApiError(errorCode.name(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
public ResponseEntity<ApiError> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
    ErrorCode errorCode = ErrorCode.INVALID_PARAM;
    return ResponseEntity.status(errorCode.getStatus())
            .body(new ApiError(errorCode.name(), e.getName() + " 값이 올바르지 않습니다."));
    }

    @ExceptionHandler (Exception.class)
    public ResponseEntity<ApiError> handleUnknown (Exception e) {
        ErrorCode errorCode = ErrorCode.INTERNAL_ERROR;
        return ResponseEntity.status(errorCode.getStatus())
                .body(new ApiError(errorCode.name(), errorCode.getDefaultMessage()));
    }
}
