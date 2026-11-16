package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "sync_errors")
public class SyncErrorEntity {
  @Id @Column(name = "error_id", length = 64) private String errorId;
  @Column(name = "error_timestamp", nullable = false, length = 32) private String errorTimestamp;
  @Column(name = "sheet_name", nullable = false, length = 80) private String sheetName;
  @Column(name = "row_number", nullable = false) private int rowNumber;
  @Column(name = "item_code", length = 32) private String itemCode;
  @Column(name = "raw_data_json", columnDefinition = "LONGTEXT") private String rawDataJson;
  @Column(name = "error_message", nullable = false, length = 1000) private String errorMessage;
  @Column(name = "status", nullable = false, length = 24) private String status = "OPEN";
  @Column(name = "resolved_by", length = 160) private String resolvedBy;
  @Column(name = "resolved_at", length = 32) private String resolvedAt;

  public String getErrorId() { return errorId; }
  public void setErrorId(String errorId) { this.errorId = errorId; }
  public String getErrorTimestamp() { return errorTimestamp; }
  public void setErrorTimestamp(String errorTimestamp) { this.errorTimestamp = errorTimestamp; }
  public String getSheetName() { return sheetName; }
  public void setSheetName(String sheetName) { this.sheetName = sheetName; }
  public int getRowNumber() { return rowNumber; }
  public void setRowNumber(int rowNumber) { this.rowNumber = rowNumber; }
  public String getItemCode() { return itemCode; }
  public void setItemCode(String itemCode) { this.itemCode = itemCode; }
  public String getRawDataJson() { return rawDataJson; }
  public void setRawDataJson(String rawDataJson) { this.rawDataJson = rawDataJson; }
  public String getErrorMessage() { return errorMessage; }
  public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getResolvedBy() { return resolvedBy; }
  public void setResolvedBy(String resolvedBy) { this.resolvedBy = resolvedBy; }
  public String getResolvedAt() { return resolvedAt; }
  public void setResolvedAt(String resolvedAt) { this.resolvedAt = resolvedAt; }
}
