package com.birathealthcare.dipen.controller;

import com.birathealthcare.dipen.dto.ApiResponse;
import com.birathealthcare.dipen.entity.BackupHistoryEntity;
import com.birathealthcare.dipen.service.BackupService;
import com.birathealthcare.dipen.service.SystemVersionService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/backups")
public class AdminBackupController {

  private final BackupService backupService;
  private final SystemVersionService versionService;

  public AdminBackupController(BackupService backupService, SystemVersionService versionService) {
    this.backupService = backupService;
    this.versionService = versionService;
  }

  @GetMapping
  public ApiResponse list() {
    return ApiResponse.ok("Backup history loaded.",
        Map.of("backups", backupService.listBackups()),
        versionService.getCurrentVersion());
  }

  @PostMapping("/run")
  public ApiResponse runManual() {
    BackupHistoryEntity b = backupService.runManualBackup();
    return ApiResponse.ok("Backup execution finished: " + b.getStatus(),
        Map.of("backup", b),
        versionService.getCurrentVersion());
  }

  @PostMapping("/{backupId}/verify")
  public ApiResponse verify(@PathVariable String backupId) {
    BackupHistoryEntity b = backupService.verifyBackupFile(backupId);
    return ApiResponse.ok("Backup verification: " + (b.isVerified() ? "PASSED" : "FAILED"),
        Map.of("backup", b),
        versionService.getCurrentVersion());
  }
}
