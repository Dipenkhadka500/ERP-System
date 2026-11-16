package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "sheets_sync_logs")
public class SheetsSyncLogEntity {
  @Id @Column(name = "sync_id", length = 64) private String syncId;
  @Column(name = "direction", nullable = false, length = 16) private String direction;
  @Column(name = "spreadsheet_scope", nullable = false, length = 32) private String spreadsheetScope;
  @Column(name = "sheet_name", nullable = false, length = 80) private String sheetName;
  @Column(name = "actor_email", nullable = false, length = 160) private String actorEmail;
  @Column(name = "rows_processed", nullable = false) private int rowsProcessed;
  @Column(name = "rows_created", nullable = false) private int rowsCreated;
  @Column(name = "rows_updated", nullable = false) private int rowsUpdated;
  @Column(name = "rows_skipped", nullable = false) private int rowsSkipped;
  @Column(name = "rows_failed", nullable = false) private int rowsFailed;
  @Column(name = "status", nullable = false, length = 24) private String status;
  @Column(name = "summary", length = 1000) private String summary;
  @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;

  public String getSyncId() { return syncId; }
  public void setSyncId(String syncId) { this.syncId = syncId; }
  public String getDirection() { return direction; }
  public void setDirection(String direction) { this.direction = direction; }
  public String getSpreadsheetScope() { return spreadsheetScope; }
  public void setSpreadsheetScope(String spreadsheetScope) { this.spreadsheetScope = spreadsheetScope; }
  public String getSheetName() { return sheetName; }
  public void setSheetName(String sheetName) { this.sheetName = sheetName; }
  public String getActorEmail() { return actorEmail; }
  public void setActorEmail(String actorEmail) { this.actorEmail = actorEmail; }
  public int getRowsProcessed() { return rowsProcessed; }
  public void setRowsProcessed(int rowsProcessed) { this.rowsProcessed = rowsProcessed; }
  public int getRowsCreated() { return rowsCreated; }
  public void setRowsCreated(int rowsCreated) { this.rowsCreated = rowsCreated; }
  public int getRowsUpdated() { return rowsUpdated; }
  public void setRowsUpdated(int rowsUpdated) { this.rowsUpdated = rowsUpdated; }
  public int getRowsSkipped() { return rowsSkipped; }
  public void setRowsSkipped(int rowsSkipped) { this.rowsSkipped = rowsSkipped; }
  public int getRowsFailed() { return rowsFailed; }
  public void setRowsFailed(int rowsFailed) { this.rowsFailed = rowsFailed; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getSummary() { return summary; }
  public void setSummary(String summary) { this.summary = summary; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
