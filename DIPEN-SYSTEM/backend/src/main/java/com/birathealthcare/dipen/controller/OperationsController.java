package com.birathealthcare.dipen.controller;

import com.birathealthcare.dipen.dto.ApiResponse;
import com.birathealthcare.dipen.integration.GoogleSheetsSyncService;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.birathealthcare.dipen.service.*;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class OperationsController {

  private final ItemMasterService itemService;
  private final InventoryTransactionService txService;
  private final StockAndReportService stockReportService;
  private final SystemVersionService versionService;
  private final PermissionChecker permissionChecker;
  private final GoogleSheetsSyncService sheetsSyncService;

  public OperationsController(
      ItemMasterService itemService,
      InventoryTransactionService txService,
      StockAndReportService stockReportService,
      SystemVersionService versionService,
      PermissionChecker permissionChecker,
      GoogleSheetsSyncService sheetsSyncService
  ) {
    this.itemService = itemService;
    this.txService = txService;
    this.stockReportService = stockReportService;
    this.versionService = versionService;
    this.permissionChecker = permissionChecker;
    this.sheetsSyncService = sheetsSyncService;
  }

  @GetMapping("/items")
  public ApiResponse listItems(@RequestParam(required = false) String category,
                               @RequestParam(required = false) String status,
                               @RequestParam(required = false) String brand,
                               @RequestParam(required = false) String query) {
    Map<String, Object> f = new LinkedHashMap<>();
    if (category != null) f.put("category", category);
    if (status != null) f.put("status", status);
    if (brand != null) f.put("brand", brand);
    if (query != null) f.put("query", query);
    var items = itemService.getAllItems(f);
    var brands = items.stream()
        .map(it -> String.valueOf(it.getOrDefault("brand", "")).trim())
        .filter(s -> !s.isEmpty())
        .distinct()
        .sorted()
        .toList();
    return ApiResponse.ok("Items loaded.", Map.of("items", items, "brands", brands), versionService.getCurrentVersion());
  }

  @PostMapping("/items")
  public ApiResponse addItem(@RequestBody Map<String, Object> payload) {
    Map<String, Object> saved = itemService.addItem(payload);
    return ApiResponse.ok("Item added.", saved, versionService.getCurrentVersion());
  }

  @PutMapping("/items/{itemCode}")
  public ApiResponse updateItem(@PathVariable String itemCode, @RequestBody Map<String, Object> payload) {
    payload.put("itemCode", itemCode);
    return ApiResponse.ok("Item updated.", itemService.updateItem(payload), versionService.getCurrentVersion());
  }

  @PatchMapping("/items/{itemCode}/status")
  public ApiResponse setItemStatus(@PathVariable String itemCode, @RequestBody Map<String, String> body) {
    return ApiResponse.ok("Status updated.", itemService.setItemStatus(itemCode, body.get("status")), versionService.getCurrentVersion());
  }

  @DeleteMapping("/items/{itemCode}")
  public ApiResponse deleteItem(@PathVariable String itemCode) {
    return ApiResponse.ok("Item deleted.", itemService.deleteItem(itemCode), versionService.getCurrentVersion());
  }

  @PostMapping("/transactions/{txType}")
  public ApiResponse createTransaction(@PathVariable String txType, @RequestBody Map<String, Object> payload) {
    String norm = txType.toUpperCase();
    String perm = switch (norm) {
      case "PRODUCTION" -> "PRODUCTION_WRITE";
      case "DISPATCH" -> "DISPATCH_WRITE";
      case "GOODS_RECEIPT" -> "RECEIPT_WRITE";
      default -> "ISSUE_WRITE";
    };
    return ApiResponse.ok("Transaction saved.", txService.createTransaction(norm, payload, perm), versionService.getCurrentVersion());
  }

  @GetMapping("/transactions")
  public ApiResponse listTransactions(@RequestParam Map<String, Object> params) {
    return ApiResponse.ok("Transactions loaded.", txService.getTransactionHistory(params), versionService.getCurrentVersion());
  }

  @GetMapping("/transactions/{txId}")
  public ApiResponse getTransaction(@PathVariable String txId) {
    return ApiResponse.ok("Transaction found.", txService.getTransactionById(txId), versionService.getCurrentVersion());
  }

  @PutMapping("/transactions/{txId}")
  public ApiResponse updateTransaction(@PathVariable String txId, @RequestBody Map<String, Object> payload) {
    return ApiResponse.ok("Transaction updated.", txService.updateTransaction(txId, payload), versionService.getCurrentVersion());
  }

  @PostMapping("/transactions/{txId}/cancel")
  public ApiResponse cancelTransaction(@PathVariable String txId, @RequestBody(required = false) Map<String, String> body) {
    return ApiResponse.ok("Transaction cancelled.",
        txService.cancelTransaction(txId, body != null ? body.get("reason") : ""),
        versionService.getCurrentVersion());
  }

  @GetMapping("/stock/balance")
  public ApiResponse stockBalance(@RequestParam(required = false) String category, @RequestParam Map<String, Object> params) {
    return ApiResponse.ok("Stock register loaded.",
        stockReportService.buildCategoryRegister(category, params),
        versionService.getCurrentVersion());
  }

  @GetMapping("/stock/item/{itemCode}")
  public ApiResponse stockByItem(@PathVariable String itemCode) {
    return ApiResponse.ok("Item stock loaded.", stockReportService.getStockByItem(itemCode), versionService.getCurrentVersion());
  }

  @GetMapping("/reports/daily")
  public ApiResponse dailyReport(@RequestParam(required = false) String reportDate) {
    return ApiResponse.ok("Daily stock report generated.",
        Map.of("snapshot", stockReportService.computeDailySnapshot(reportDate)),
        versionService.getCurrentVersion());
  }

  @PostMapping("/reports/daily/submit")
  public ApiResponse submitDailyReport(@RequestBody(required = false) Map<String, String> body) {
    String date = body != null ? body.get("reportDate") : null;
    return ApiResponse.ok("Daily report submitted.",
        stockReportService.submitDailyReport(date),
        versionService.getCurrentVersion());
  }

  @GetMapping("/dashboard/operations")
  public ApiResponse dashboard() {
    return ApiResponse.ok("Dashboard loaded.", stockReportService.getDashboardData(), versionService.getCurrentVersion());
  }

  @GetMapping("/audit-logs")
  public ApiResponse auditLogs(@RequestParam(defaultValue = "100") int limit) {
    return ApiResponse.ok("Audit logs loaded.", Map.of("logs", stockReportService.getAuditLogs(limit)), versionService.getCurrentVersion());
  }

  @GetMapping("/system/sync-status")
  public ApiResponse syncStatus() {
    return ApiResponse.ok("Sync status loaded.", sheetsSyncService.getSyncOverview(), versionService.getCurrentVersion());
  }

  @PostMapping("/system/settings")
  public ApiResponse updateSetting(@RequestBody Map<String, String> body) {
    var actor = permissionChecker.assertPermission("SYNC_ADMIN");
    String key = body.get("key");
    String val = body.get("value");
    versionService.saveSetting(key, val, null);
    versionService.bumpVersion();
    return ApiResponse.ok("Setting updated by " + actor.getEmail(), Map.of("key", key, "value", val), versionService.getCurrentVersion());
  }
}
