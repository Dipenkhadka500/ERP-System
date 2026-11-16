package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "backup_history")
public class BackupHistoryEntity {
  @Id @Column(name = "backup_id", length = 64) private String backupId;
  @Column(name = "backup_type", nullable = false, length = 24) private String backupType;
  @Column(name = "file_name", nullable = false, length = 255) private String fileName;
  @Column(name = "file_path", nullable = false, length = 500) private String filePath;
  @Column(name = "file_size_bytes", nullable = false) private long fileSizeBytes;
  @Column(name = "sha256_checksum", length = 128) private String sha256Checksum;
  @Column(name = "verified", nullable = false) private boolean verified;
  @Column(name = "status", nullable = false, length = 24) private String status;
  @Column(name = "triggered_by", nullable = false, length = 160) private String triggeredBy;
  @Column(name = "error_message", length = 1000) private String errorMessage;
  @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;

  public String getBackupId() { return backupId; }
  public void setBackupId(String backupId) { this.backupId = backupId; }
  public String getBackupType() { return backupType; }
  public void setBackupType(String backupType) { this.backupType = backupType; }
  public String getFileName() { return fileName; }
  public void setFileName(String fileName) { this.fileName = fileName; }
  public String getFilePath() { return filePath; }
  public void setFilePath(String filePath) { this.filePath = filePath; }
  public long getFileSizeBytes() { return fileSizeBytes; }
  public void setFileSizeBytes(long fileSizeBytes) { this.fileSizeBytes = fileSizeBytes; }
  public String getSha256Checksum() { return sha256Checksum; }
  public void setSha256Checksum(String sha256Checksum) { this.sha256Checksum = sha256Checksum; }
  public boolean isVerified() { return verified; }
  public void setVerified(boolean verified) { this.verified = verified; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getTriggeredBy() { return triggeredBy; }
  public void setTriggeredBy(String triggeredBy) { this.triggeredBy = triggeredBy; }
  public String getErrorMessage() { return errorMessage; }
  public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
  public LocalDateTime getCreatedAt() { return createdAt; }
  public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
