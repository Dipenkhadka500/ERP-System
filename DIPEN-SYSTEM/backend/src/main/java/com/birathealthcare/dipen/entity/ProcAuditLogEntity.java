package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "proc_audit_logs")
public class ProcAuditLogEntity {
  @Id @Column(name = "log_id", length = 64) private String logId;
  @Column(name = "log_timestamp", nullable = false, length = 64) private String logTimestamp;
  @Column(name = "user_email", nullable = false, length = 160) private String userEmail;
  @Column(name = "action", nullable = false, length = 64) private String action;
  @Column(name = "module_name", nullable = false, length = 80) private String moduleName;
  @Column(name = "record_id", length = 120) private String recordId = "";
  @Column(name = "details", columnDefinition = "LONGTEXT") private String details;

  public String getLogId() { return logId; }
  public void setLogId(String logId) { this.logId = logId; }
  public String getLogTimestamp() { return logTimestamp; }
  public void setLogTimestamp(String logTimestamp) { this.logTimestamp = logTimestamp; }
  public String getUserEmail() { return userEmail; }
  public void setUserEmail(String userEmail) { this.userEmail = userEmail; }
  public String getAction() { return action; }
  public void setAction(String action) { this.action = action; }
  public String getModuleName() { return moduleName; }
  public void setModuleName(String moduleName) { this.moduleName = moduleName; }
  public String getRecordId() { return recordId; }
  public void setRecordId(String recordId) { this.recordId = recordId; }
  public String getDetails() { return details; }
  public void setDetails(String details) { this.details = details; }
}
