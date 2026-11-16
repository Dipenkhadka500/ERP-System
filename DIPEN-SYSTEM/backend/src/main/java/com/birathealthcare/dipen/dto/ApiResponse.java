package com.birathealthcare.dipen.dto;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public class ApiResponse {
  private boolean success;
  private String message;
  private Object data;
  private String timestamp;
  private long version;

  public ApiResponse() {}

  public ApiResponse(boolean success, String message, Object data, long version) {
    this.success = success;
    this.message = message == null ? "" : message;
    this.data = data == null ? new LinkedHashMap<>() : data;
    this.timestamp = Instant.now().toString();
    this.version = version;
  }

  public static ApiResponse ok(String message, Object data, long version) {
    return new ApiResponse(true, message, data, version);
  }

  public static ApiResponse ok(String message, long version) {
    return new ApiResponse(true, message, Map.of(), version);
  }

  public static ApiResponse fail(String message, long version) {
    return new ApiResponse(false, message, Map.of(), version);
  }

  public boolean isSuccess() { return success; }
  public void setSuccess(boolean success) { this.success = success; }
  public String getMessage() { return message; }
  public void setMessage(String message) { this.message = message; }
  public Object getData() { return data; }
  public void setData(Object data) { this.data = data; }
  public String getTimestamp() { return timestamp; }
  public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
  public long getVersion() { return version; }
  public void setVersion(long version) { this.version = version; }
}
