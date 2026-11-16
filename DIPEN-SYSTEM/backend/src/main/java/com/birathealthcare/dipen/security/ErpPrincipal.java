package com.birathealthcare.dipen.security;

import java.util.List;

public class ErpPrincipal {
  private final String email;
  private final String displayName;
  private final String role;
  private final String department;
  private final String status;
  private final List<String> permissions;

  public ErpPrincipal(String email, String displayName, String role, String department, String status, List<String> permissions) {
    this.email = email;
    this.displayName = displayName;
    this.role = role;
    this.department = department;
    this.status = status;
    this.permissions = permissions;
  }

  public String getEmail() { return email; }
  public String getDisplayName() { return displayName; }
  public String getRole() { return role; }
  public String getDepartment() { return department; }
  public String getStatus() { return status; }
  public List<String> getPermissions() { return permissions; }

  public boolean hasPermission(String perm) {
    return "Active".equalsIgnoreCase(status) && permissions != null && permissions.contains(perm);
  }
}
