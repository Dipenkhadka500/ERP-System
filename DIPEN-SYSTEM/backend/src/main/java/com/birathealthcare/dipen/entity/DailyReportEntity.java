package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

@Entity
@Table(name = "daily_reports")
public class DailyReportEntity {
  @Id @Column(name = "report_id", length = 64) private String reportId;
  @Column(name = "report_date", nullable = false, unique = true) private LocalDate reportDate;
  @Column(name = "submitted_by", nullable = false, length = 160) private String submittedBy;
  @Column(name = "submitted_at", nullable = false, length = 32) private String submittedAt;
  @Column(name = "total_active_items", nullable = false) private int totalActiveItems;
  @Column(name = "stock_in_count", nullable = false) private int stockInCount;
  @Column(name = "stock_out_count", nullable = false) private int stockOutCount;
  @Column(name = "below_reorder_count", nullable = false) private int belowReorderCount;
  @Column(name = "zero_balance_count", nullable = false) private int zeroBalanceCount;
  @Column(name = "snapshot_json", nullable = false, columnDefinition = "LONGTEXT") private String snapshotJson;
  @Column(name = "status", nullable = false, length = 32) private String status = "SUBMITTED";

  public String getReportId() { return reportId; }
  public void setReportId(String reportId) { this.reportId = reportId; }
  public LocalDate getReportDate() { return reportDate; }
  public void setReportDate(LocalDate reportDate) { this.reportDate = reportDate; }
  public String getSubmittedBy() { return submittedBy; }
  public void setSubmittedBy(String submittedBy) { this.submittedBy = submittedBy; }
  public String getSubmittedAt() { return submittedAt; }
  public void setSubmittedAt(String submittedAt) { this.submittedAt = submittedAt; }
  public int getTotalActiveItems() { return totalActiveItems; }
  public void setTotalActiveItems(int totalActiveItems) { this.totalActiveItems = totalActiveItems; }
  public int getStockInCount() { return stockInCount; }
  public void setStockInCount(int stockInCount) { this.stockInCount = stockInCount; }
  public int getStockOutCount() { return stockOutCount; }
  public void setStockOutCount(int stockOutCount) { this.stockOutCount = stockOutCount; }
  public int getBelowReorderCount() { return belowReorderCount; }
  public void setBelowReorderCount(int belowReorderCount) { this.belowReorderCount = belowReorderCount; }
  public int getZeroBalanceCount() { return zeroBalanceCount; }
  public void setZeroBalanceCount(int zeroBalanceCount) { this.zeroBalanceCount = zeroBalanceCount; }
  public String getSnapshotJson() { return snapshotJson; }
  public void setSnapshotJson(String snapshotJson) { this.snapshotJson = snapshotJson; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
}
