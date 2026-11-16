package com.birathealthcare.dipen.controller;

import com.birathealthcare.dipen.dto.ApiResponse;
import com.birathealthcare.dipen.integration.GoogleSheetsSyncService;
import com.birathealthcare.dipen.service.SystemVersionService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/sheets")
public class SheetsIntegrationController {

  private final GoogleSheetsSyncService syncService;
  private final SystemVersionService versionService;

  public SheetsIntegrationController(GoogleSheetsSyncService syncService, SystemVersionService versionService) {
    this.syncService = syncService;
    this.versionService = versionService;
  }

  @GetMapping("/status")
  public ApiResponse status() {
    return ApiResponse.ok("Google Sheets status loaded.", syncService.getSyncOverview(), versionService.getCurrentVersion());
  }

  @PostMapping("/import/preview")
  public ApiResponse previewImport(@RequestBody Map<String, String> body) {
    String scope = body.getOrDefault("scope", "OPERATIONS");
    String sheetName = body.get("sheetName");
    return ApiResponse.ok("Import preview generated.",
        syncService.previewImportFromSheet(scope, sheetName),
        versionService.getCurrentVersion());
  }

  @PostMapping("/import/commit")
  public ApiResponse commitImport(@RequestBody Map<String, String> body) {
    String scope = body.getOrDefault("scope", "OPERATIONS");
    String sheetName = body.get("sheetName");
    return ApiResponse.ok("Import committed to DIPEN_ERP.",
        syncService.commitImportFromSheet(scope, sheetName),
        versionService.getCurrentVersion());
  }

  @PostMapping("/export")
  public ApiResponse exportToSheet(@RequestBody Map<String, String> body) {
    String scope = body.getOrDefault("scope", "OPERATIONS");
    String sheetName = body.get("sheetName");
    return ApiResponse.ok("Exported to Google Sheet.",
        syncService.exportToGoogleSheet(scope, sheetName),
        versionService.getCurrentVersion());
  }

  @PostMapping("/sync-all")
  public ApiResponse syncAllBidirectional() {
    Map<String, Object> res = syncService.syncAllBidirectionalNow();
    return ApiResponse.ok("Two-way Google Sheets sync completed.",
        res,
        versionService.getCurrentVersion());
  }

  @PostMapping("/errors/{errorId}/resolve")
  public ApiResponse resolveError(@PathVariable String errorId) {
    syncService.resolveSyncError(errorId);
    return ApiResponse.ok("Sync error resolved.", versionService.getCurrentVersion());
  }
}
