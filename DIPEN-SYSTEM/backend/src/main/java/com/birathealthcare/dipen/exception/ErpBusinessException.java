package com.birathealthcare.dipen.exception;

public class ErpBusinessException extends RuntimeException {
  private final int httpStatus;

  public ErpBusinessException(String message) {
    this(message, 400);
  }

  public ErpBusinessException(String message, int httpStatus) {
    super(message);
    this.httpStatus = httpStatus;
  }

  public int getHttpStatus() {
    return httpStatus;
  }
}
