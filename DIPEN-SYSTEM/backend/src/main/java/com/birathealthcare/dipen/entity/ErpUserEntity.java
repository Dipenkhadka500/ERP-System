package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "erp_users")
public class ErpUserEntity {

  @Id
  @Column(name = "email", length = 160)
  private String email;

  @Column(name = "alias_emails", length = 255)
  private String aliasEmails;

  @Column(name = "display_name", nullable = false, length = 120)
  private String displayName;

  @Column(name = "password_hash", length = 255)
  private String passwordHash;

  @Column(name = "legacy_sha256_hash", length = 128)
  private String legacySha256Hash;

  @Column(name = "bcrypt_upgraded", nullable = false)
  private boolean bcryptUpgraded;

  @Column(name = "role_name", nullable = false, length = 64)
  private String roleName;

  @Column(name = "department", length = 120)
  private String department;

  @Column(name = "status", nullable = false, length = 32)
  private String status = "Active";

  @Column(name = "last_login_at")
  private LocalDateTime lastLoginAt;

  public String getEmail() { return email; }
  public void setEmail(String email) { this.email = email; }
  public String getAliasEmails() { return aliasEmails; }
  public void setAliasEmails(String aliasEmails) { this.aliasEmails = aliasEmails; }
  public String getDisplayName() { return displayName; }
  public void setDisplayName(String displayName) { this.displayName = displayName; }
  public String getPasswordHash() { return passwordHash; }
  public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
  public String getLegacySha256Hash() { return legacySha256Hash; }
  public void setLegacySha256Hash(String legacySha256Hash) { this.legacySha256Hash = legacySha256Hash; }
  public boolean isBcryptUpgraded() { return bcryptUpgraded; }
  public void setBcryptUpgraded(boolean bcryptUpgraded) { this.bcryptUpgraded = bcryptUpgraded; }
  public String getRoleName() { return roleName; }
  public void setRoleName(String roleName) { this.roleName = roleName; }
  public String getDepartment() { return department; }
  public void setDepartment(String department) { this.department = department; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public LocalDateTime getLastLoginAt() { return lastLoginAt; }
  public void setLastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }
}
