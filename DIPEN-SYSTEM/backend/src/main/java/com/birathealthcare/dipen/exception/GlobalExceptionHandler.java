package com.birathealthcare.dipen.exception;

import com.birathealthcare.dipen.dto.ApiResponse;
import com.birathealthcare.dipen.service.SystemVersionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  private final SystemVersionService versionService;

  public GlobalExceptionHandler(SystemVersionService versionService) {
    this.versionService = versionService;
  }

  @ExceptionHandler(ErpBusinessException.class)
  public ResponseEntity<ApiResponse> handleBusiness(ErpBusinessException ex) {
    long ver = versionService.getCurrentVersion();
    HttpStatus status = HttpStatus.resolve(ex.getHttpStatus());
    if (status == null) status = HttpStatus.BAD_REQUEST;
    return ResponseEntity.status(status).body(ApiResponse.fail(ex.getMessage(), ver));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiResponse> handleGeneric(Exception ex) {
    long ver = versionService.getCurrentVersion();
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiResponse.fail(ex.getMessage() != null ? ex.getMessage() : "Internal server error", ver));
  }
}
