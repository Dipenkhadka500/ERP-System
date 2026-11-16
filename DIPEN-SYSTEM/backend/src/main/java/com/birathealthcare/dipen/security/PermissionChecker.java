package com.birathealthcare.dipen.security;

import com.birathealthcare.dipen.exception.ErpBusinessException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class PermissionChecker {

  public ErpPrincipal currentPrincipal() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth == null || !(auth.getPrincipal() instanceof ErpPrincipal principal)) {
      throw new ErpBusinessException("Authentication required. Please sign in.", 401);
    }
    return principal;
  }

  public ErpPrincipal assertPermission(String permission) {
    ErpPrincipal user = currentPrincipal();
    if (!user.hasPermission(permission)) {
      throw new ErpBusinessException(
          "Access denied: Role \"" + user.getRole() + "\" lacks required permission (" + permission + ").",
          403
      );
    }
    return user;
  }

  public ErpPrincipal assertAnyPermission(String... permissions) {
    ErpPrincipal user = currentPrincipal();
    for (String perm : permissions) {
      if (user.hasPermission(perm)) return user;
    }
    throw new ErpBusinessException(
        "Access denied: Role \"" + user.getRole() + "\" lacks required permissions.",
        403
    );
  }
}
