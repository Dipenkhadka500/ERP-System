package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.BackupHistoryEntity;
import com.birathealthcare.dipen.repository.BackupHistoryRepository;
import com.birathealthcare.dipen.security.PermissionChecker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class BackupService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");
  private static final DateTimeFormatter FILE_TS = DateTimeFormatter.ofPattern("yyyy-MM-dd_HHmmss");

  private final BackupHistoryRepository backupRepo;
  private final PermissionChecker permissionChecker;
  private final AuditService auditService;

  @Value("${dipen.backup.enabled:true}")
  private boolean backupEnabled;

  @Value("${dipen.backup.directory:D:/DIPEN_BACKUPS}")
  private String backupDirectory;

  @Value("${dipen.backup.mysqldump-path:mysqldump}")
  private String mysqldumpPath;

  @Value("${dipen.backup.retention-days:30}")
  private int retentionDays;

  @Value("${spring.datasource.username:dipen_app}")
  private String dbUser;

  @Value("${spring.datasource.password:}")
  private String dbPassword;

  public BackupService(BackupHistoryRepository backupRepo, PermissionChecker permissionChecker, AuditService auditService) {
    this.backupRepo = backupRepo;
    this.permissionChecker = permissionChecker;
    this.auditService = auditService;
  }

  @Scheduled(cron = "${dipen.backup.cron:0 0 2 * * *}", zone = "Asia/Kathmandu")
  public void runScheduledDailyBackup() {
    if (!backupEnabled) return;
    executeBackupInternal("SCHEDULED", "system-scheduler");
  }

  @Transactional
  public BackupHistoryEntity runManualBackup() {
    var actor = permissionChecker.assertPermission("SYNC_ADMIN");
    BackupHistoryEntity rec = executeBackupInternal("MANUAL", actor.getEmail());
    auditService.logOperations(actor.getEmail(), actor.getRole(), "BACKUP_DATABASE", "Backup",
        rec.getBackupId(), "Backup status=" + rec.getStatus() + ", file=" + rec.getFileName(), null, null);
    return rec;
  }

  public List<BackupHistoryEntity> listBackups() {
    permissionChecker.assertPermission("SYNC_ADMIN");
    return backupRepo.findAllByOrderByCreatedAtDesc();
  }

  public BackupHistoryEntity verifyBackupFile(String backupId) {
    permissionChecker.assertPermission("SYNC_ADMIN");
    BackupHistoryEntity rec = backupRepo.findById(backupId)
        .orElseThrow(() -> new IllegalArgumentException("Backup record not found: " + backupId));
    Path p = Path.of(rec.getFilePath());
    boolean ok = verifySqlDumpFile(p);
    rec.setVerified(ok);
    rec.setStatus(ok ? "VERIFIED" : "FAILED_VERIFY");
    return backupRepo.save(rec);
  }

  private BackupHistoryEntity executeBackupInternal(String type, String actorEmail) {
    LocalDateTime now = LocalDateTime.now(KTM);
    String id = "BKP-" + now.format(FILE_TS) + "-" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
    String fileName = "DIPEN_ERP_" + now.format(FILE_TS) + ".sql";
    BackupHistoryEntity rec = new BackupHistoryEntity();
    rec.setBackupId(id);
    rec.setBackupType(type);
    rec.setFileName(fileName);
    rec.setTriggeredBy(actorEmail);
    rec.setCreatedAt(now);

    try {
      Path dir = Path.of(backupDirectory);
      Files.createDirectories(dir);
      Path outFile = dir.resolve(fileName);
      rec.setFilePath(outFile.toAbsolutePath().toString());

      List<String> cmd = List.of(
          mysqldumpPath,
          "--single-transaction",
          "--routines",
          "--triggers",
          "--databases", "DIPEN_ERP",
          "-u", dbUser,
          "--result-file=" + outFile.toAbsolutePath()
      );
      ProcessBuilder pb = new ProcessBuilder(cmd);
      if (dbPassword != null && !dbPassword.isEmpty()) {
        pb.environment().put("MYSQL_PWD", dbPassword);
      }
      pb.redirectErrorStream(true);
      Process proc = pb.start();
      String processOutput = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
      int exitCode = proc.waitFor();

      if (exitCode != 0) {
        rec.setStatus("FAILED");
        rec.setVerified(false);
        rec.setErrorMessage("mysqldump exited with code " + exitCode + ": " + processOutput);
      } else {
        boolean verified = verifySqlDumpFile(outFile);
        rec.setFileSizeBytes(Files.size(outFile));
        rec.setSha256Checksum(sha256File(outFile));
        rec.setVerified(verified);
        rec.setStatus(verified ? "SUCCESS" : "UNVERIFIED");
        if (!verified) {
          rec.setErrorMessage("Dump file created but failed completion-marker verification.");
        } else {
          purgeOldBackups(dir);
        }
      }
    } catch (Exception ex) {
      rec.setFilePath(backupDirectory + File.separator + fileName);
      rec.setStatus("FAILED");
      rec.setVerified(false);
      rec.setErrorMessage(ex.getMessage());
    }
    return backupRepo.save(rec);
  }

  private boolean verifySqlDumpFile(Path file) {
    try {
      if (!Files.exists(file) || Files.size(file) < 256) return false;
      String content = Files.readString(file, StandardCharsets.UTF_8);
      return content.contains("Dump completed") && content.contains("CREATE TABLE");
    } catch (Exception e) {
      return false;
    }
  }

  private void purgeOldBackups(Path dir) {
    try (var stream = Files.list(dir)) {
      long cutoffMs = System.currentTimeMillis() - (retentionDays * 86400_000L);
      stream.filter(p -> p.getFileName().toString().endsWith(".sql"))
          .forEach(p -> {
            try {
              if (Files.getLastModifiedTime(p).toMillis() < cutoffMs) {
                Files.deleteIfExists(p);
              }
            } catch (Exception ignored) {}
          });
    } catch (Exception ignored) {}
  }

  private String sha256File(Path file) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    try (FileInputStream fis = new FileInputStream(file.toFile())) {
      byte[] buf = new byte[8192];
      int n;
      while ((n = fis.read(buf)) > 0) md.update(buf, 0, n);
    }
    StringBuilder sb = new StringBuilder();
    for (byte b : md.digest()) sb.append(String.format("%02x", b));
    return sb.toString();
  }
}
