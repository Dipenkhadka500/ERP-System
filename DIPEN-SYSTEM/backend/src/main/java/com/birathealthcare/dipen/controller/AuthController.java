package com.birathealthcare.dipen.controller;

import com.birathealthcare.dipen.dto.ApiResponse;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.birathealthcare.dipen.service.AuthService;
import com.birathealthcare.dipen.service.SystemVersionService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

  private final AuthService authService;
  private final PermissionChecker permissionChecker;
  private final SystemVersionService versionService;

  public AuthController(AuthService authService, PermissionChecker permissionChecker, SystemVersionService versionService) {
    this.authService = authService;
    this.permissionChecker = permissionChecker;
    this.versionService = versionService;
  }

  @PostMapping("/login")
  public ApiResponse login(@RequestBody Map<String, String> body) {
    Map<String, Object> data = authService.login(body.get("userId"), body.get("password"));
    return ApiResponse.ok("Signed in successfully.", data, versionService.getCurrentVersion());
  }

  @PostMapping("/logout")
  public ApiResponse logout(@RequestHeader(value = "Authorization", required = false) String authHeader,
                            @RequestHeader(value = "X-Auth-Token", required = false) String xToken) {
    String token = (authHeader != null && authHeader.startsWith("Bearer ")) ? authHeader.substring(7).trim() : xToken;
    return ApiResponse.ok("Signed out successfully.", authService.logout(token), versionService.getCurrentVersion());
  }

  @GetMapping("/me")
  public ApiResponse me(@RequestHeader(value = "Authorization", required = false) String authHeader,
                        @RequestHeader(value = "X-Auth-Token", required = false) String xToken) {
    String token = (authHeader != null && authHeader.startsWith("Bearer ")) ? authHeader.substring(7).trim() : xToken;
    Map<String, Object> ctx = authService.getCurrentUserContext(token);
    String msg = Boolean.TRUE.equals(ctx.get("authenticated")) ? "User context loaded." : "Authentication required.";
    return ApiResponse.ok(msg, ctx, versionService.getCurrentVersion());
  }

  @PostMapping("/change-password")
  public ApiResponse changePassword(@RequestBody Map<String, String> body) {
    var actor = permissionChecker.currentPrincipal();
    authService.changePassword(actor, body.get("currentPassword"), body.get("newPassword"));
    return ApiResponse.ok("Password updated successfully using BCrypt.", versionService.getCurrentVersion());
  }
}
