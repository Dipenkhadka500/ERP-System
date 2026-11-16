package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "operations_audit_logs")
public class OperationsAuditLogEntity {
  @Id @Column(name = "audit_id", length = 64) private String auditId;
  @Column(name = "log_timestamp", nullable = false, length = 32) private String logTimestamp;
  @Column(name = "user_email", nullable = false, length = 160) private String userEmail;
  @Column(name = "user_role", nullable = false, length = 64) private String userRole;
  @Column(name = "action", nullable = false, length = 64) private String action;
  @Column(name = "module_name", nullable = false, length = 80) private String moduleName;
  @Column(name = "target_id", length = 120) private String targetId;
  @Column(name = "summary", length = 500) private String summary;
  @Column(name = "before_json", columnDefinition = "LONGTEXT") private String beforeJson;
  @Column(name = "after_json", columnDefinition = "LONGTEXT") private String afterJson;

  public String getAuditId() { return auditId; }
  public void setAuditId(String auditId) { this.auditId = auditId; }
  public String getLogTimestamp() { return logTimestamp; }
  public void setLogTimestamp(String logTimestamp) { this.logTimestamp = logTimestamp; }
  public String getUserEmail() { return userEmail; }
  public void setUserEmail(String userEmail) { this.userEmail = userEmail; }
  public String getUserRole() { return userRole; }
  public void setUserRole(String userRole) { this.userRole = userRole; }
  public String getAction() { return action; }
  public void setAction(String action) { this.action = action; }
  public String getModuleName() { return moduleName; }
  public void setModuleName(String moduleName) { this.moduleName = moduleName; }
  public String getTargetId() { return targetId; }
  public void setTargetId(String targetId) { this.targetId = targetId; }
  public String getSummary() { return summary; }
  public void setSummary(String summary) { this.summary = summary; }
  public String getBeforeJson() { return beforeJson; }
  public void setBeforeJson(String beforeJson) { this.beforeJson = beforeJson; }
  public String getAfterJson() { return afterJson; }
  public void setAfterJson(String afterJson) { this.afterJson = afterJson; }
}
