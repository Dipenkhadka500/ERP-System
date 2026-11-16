package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "erp_sessions")
public class ErpSessionEntity {

  @Id
  @Column(name = "token", length = 128)
  private String token;

  @Column(name = "user_email", nullable = false, length = 160)
  private String userEmail;

  @Column(name = "role_name", nullable = false, length = 64)
  private String roleName;

  @Column(name = "login_at", nullable = false)
  private LocalDateTime loginAt;

  @Column(name = "expires_at", nullable = false)
  private LocalDateTime expiresAt;

  @Column(name = "revoked", nullable = false)
  private boolean revoked;

  public String getToken() { return token; }
  public void setToken(String token) { this.token = token; }
  public String getUserEmail() { return userEmail; }
  public void setUserEmail(String userEmail) { this.userEmail = userEmail; }
  public String getRoleName() { return roleName; }
  public void setRoleName(String roleName) { this.roleName = roleName; }
  public LocalDateTime getLoginAt() { return loginAt; }
  public void setLoginAt(LocalDateTime loginAt) { this.loginAt = loginAt; }
  public LocalDateTime getExpiresAt() { return expiresAt; }
  public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
  public boolean isRevoked() { return revoked; }
  public void setRevoked(boolean revoked) { this.revoked = revoked; }
}
