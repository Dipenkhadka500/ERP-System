package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.ErpSessionEntity;
import com.birathealthcare.dipen.entity.ErpUserEntity;
import com.birathealthcare.dipen.exception.ErpBusinessException;
import com.birathealthcare.dipen.repository.ErpSessionRepository;
import com.birathealthcare.dipen.repository.ErpUserRepository;
import com.birathealthcare.dipen.security.ErpPrincipal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class AuthService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");
  private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  private final ErpUserRepository userRepository;
  private final ErpSessionRepository sessionRepository;
  private final PasswordEncoder passwordEncoder;
  private final SystemVersionService versionService;
  private final AuditService auditService;

  @Value("${dipen.session.ttl-seconds:21600}")
  private long sessionTtlSeconds;

  public AuthService(
      ErpUserRepository userRepository,
      ErpSessionRepository sessionRepository,
      PasswordEncoder passwordEncoder,
      SystemVersionService versionService,
      AuditService auditService
  ) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.passwordEncoder = passwordEncoder;
    this.versionService = versionService;
    this.auditService = auditService;
  }

  @Transactional
  public Map<String, Object> login(String userId, String password) {
    String cleanId = userId == null ? "" : userId.trim().toLowerCase();
    String cleanPass = password == null ? "" : password;
    if (cleanId.isEmpty() || cleanPass.isEmpty()) {
      throw new ErpBusinessException("Please enter both User ID and Password.", 400);
    }

    ErpUserEntity user = userRepository.findByEmailOrAlias(cleanId)
        .orElseThrow(() -> new ErpBusinessException("Invalid User ID or password. Please verify your credentials.", 401));

    if (!"Active".equalsIgnoreCase(user.getStatus())) {
      throw new ErpBusinessException("This account is currently inactive. Contact the System Administrator.", 403);
    }

    boolean verified = false;
    if (user.getPasswordHash() != null && !user.getPasswordHash().isBlank()) {
      verified = passwordEncoder.matches(cleanPass, user.getPasswordHash());
    } else if (user.getLegacySha256Hash() != null && !user.getLegacySha256Hash().isBlank()) {
      String sha = sha256Hex(cleanPass);
      if (sha.equalsIgnoreCase(user.getLegacySha256Hash())) {
        verified = true;
        // Transparently upgrade preserved SHA-256 credential to BCrypt on first verified login
        user.setPasswordHash(passwordEncoder.encode(cleanPass));
        user.setLegacySha256Hash(null);
        user.setBcryptUpgraded(true);
      }
    }

    if (!verified) {
      throw new ErpBusinessException("Invalid User ID or password. Please verify your credentials.", 401);
    }

    LocalDateTime now = LocalDateTime.now(KTM);
    user.setLastLoginAt(now);
    userRepository.save(user);

    String token = UUID.randomUUID() + "-" + System.currentTimeMillis();
    ErpSessionEntity session = new ErpSessionEntity();
    session.setToken(token);
    session.setUserEmail(user.getEmail());
    session.setRoleName(user.getRoleName());
    session.setLoginAt(now);
    session.setExpiresAt(now.plusSeconds(sessionTtlSeconds));
    session.setRevoked(false);
    sessionRepository.save(session);

    auditService.logOperations(
        user.getEmail(),
        user.getRoleName(),
        "USER_LOGIN",
        "Authentication",
        user.getEmail(),
        "User signed into ERP portal as " + user.getRoleName(),
        null,
        Map.of("loginAt", now.format(DT_FMT))
    );

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("token", token);
    result.put("user", buildUserPayload(user));
    return result;
  }

  @Transactional
  public Map<String, Object> logout(String token) {
    if (token != null && !token.isBlank()) {
      sessionRepository.findByTokenAndRevokedFalse(token.trim()).ifPresent(session -> {
        session.setRevoked(true);
        sessionRepository.save(session);
        auditService.logOperations(
            session.getUserEmail(),
            session.getRoleName(),
            "USER_LOGOUT",
            "Authentication",
            session.getUserEmail(),
            "User signed out of ERP portal",
            null,
            null
        );
      });
    }
    return Map.of("authenticated", false);
  }

  public Map<String, Object> getCurrentUserContext(String token) {
    if (token == null || token.isBlank()) {
      return Map.of("authenticated", false);
    }
    Optional<ErpSessionEntity> sessionOpt = sessionRepository.findByTokenAndRevokedFalse(token.trim());
    if (sessionOpt.isEmpty() || sessionOpt.get().getExpiresAt().isBefore(LocalDateTime.now(KTM))) {
      return Map.of("authenticated", false);
    }
    Optional<ErpUserEntity> userOpt = userRepository.findById(sessionOpt.get().getUserEmail());
    if (userOpt.isEmpty() || !"Active".equalsIgnoreCase(userOpt.get().getStatus())) {
      return Map.of("authenticated", false);
    }
    return buildUserPayload(userOpt.get());
  }

  @Transactional
  public void changePassword(ErpPrincipal actor, String currentPassword, String newPassword) {
    if (newPassword == null || newPassword.length() < 6) {
      throw new ErpBusinessException("New password must be at least 6 characters.", 400);
    }
    ErpUserEntity user = userRepository.findById(actor.getEmail())
        .orElseThrow(() -> new ErpBusinessException("User account not found.", 404));

    boolean currentValid = user.getPasswordHash() != null
        ? passwordEncoder.matches(currentPassword, user.getPasswordHash())
        : (user.getLegacySha256Hash() != null && sha256Hex(currentPassword).equalsIgnoreCase(user.getLegacySha256Hash()));

    if (!currentValid) {
      throw new ErpBusinessException("Current password is incorrect.", 400);
    }

    user.setPasswordHash(passwordEncoder.encode(newPassword));
    user.setLegacySha256Hash(null);
    user.setBcryptUpgraded(true);
    userRepository.save(user);

    auditService.logOperations(
        actor.getEmail(), actor.getRole(), "PASSWORD_CHANGED",
        "Authentication", actor.getEmail(), "User updated password (BCrypt)", null, null
    );
  }

  private Map<String, Object> buildUserPayload(ErpUserEntity user) {
    List<String> perms = userRepository.findPermissionsByRole(user.getRoleName());
    Map<String, String> settings = versionService.getAllSettingsMap();
    int pollSec = 30;
    try {
      pollSec = Integer.parseInt(settings.getOrDefault("POLL_INTERVAL_SEC", "30"));
    } catch (Exception ignored) {}

    Map<String, Object> u = new LinkedHashMap<>();
    u.put("authenticated", true);
    u.put("displayName", user.getDisplayName());
    u.put("email", user.getEmail());
    u.put("role", user.getRoleName());
    u.put("department", user.getDepartment() != null ? user.getDepartment() : "");
    u.put("permissions", perms);
    u.put("pollIntervalSec", pollSec);
    u.put("allowNegativeOverride", "TRUE".equalsIgnoreCase(settings.getOrDefault("ALLOW_NEGATIVE_STOCK_OVERRIDE", "FALSE")));
    u.put("authorizeFinishedGoodsIssue", "TRUE".equalsIgnoreCase(settings.getOrDefault("AUTHORIZE_FG_ISSUE", "FALSE")));
    return u;
  }

  public static String sha256Hex(String raw) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] digest = md.digest((raw == null ? "" : raw).getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder(digest.length * 2);
      for (byte b : digest) {
        sb.append(String.format("%02x", b));
      }
      return sb.toString();
    } catch (Exception e) {
      throw new RuntimeException("SHA-256 calculation failed", e);
    }
  }
}
