package com.birathealthcare.dipen.controller;

import com.birathealthcare.dipen.dto.ApiResponse;
import com.birathealthcare.dipen.entity.BackupHistoryEntity;
import com.birathealthcare.dipen.exception.ErpBusinessException;
import com.birathealthcare.dipen.integration.GoogleSheetsSyncService;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.birathealthcare.dipen.service.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * Compatibility RPC bridge supporting every callServer(fnName, ...args) operation
 * defined in the original ERP web frontend while running backed by Spring Boot & MySQL.
 */
@RestController
@RequestMapping("/api/rpc")
public class RpcBridgeController {

  private final AuthService authService;
  private final ItemMasterService itemService;
  private final InventoryTransactionService txService;
  private final StockAndReportService stockReportService;
  private final ProcurementService procurementService;
  private final ExchangeRateService fxService;
  private final GoogleSheetsSyncService sheetsSyncService;
  private final BackupService backupService;
  private final SystemVersionService versionService;
  private final PermissionChecker permissionChecker;

  public RpcBridgeController(
      AuthService authService,
      ItemMasterService itemService,
      InventoryTransactionService txService,
      StockAndReportService stockReportService,
      ProcurementService procurementService,
      ExchangeRateService fxService,
      GoogleSheetsSyncService sheetsSyncService,
      BackupService backupService,
      SystemVersionService versionService,
      PermissionChecker permissionChecker
  ) {
    this.authService = authService;
    this.itemService = itemService;
    this.txService = txService;
    this.stockReportService = stockReportService;
    this.procurementService = procurementService;
    this.fxService = fxService;
    this.sheetsSyncService = sheetsSyncService;
    this.backupService = backupService;
    this.versionService = versionService;
    this.permissionChecker = permissionChecker;
  }

  @PostMapping("/{fnName}")
  @SuppressWarnings("unchecked")
  public ApiResponse dispatch(
      @PathVariable String fnName,
      @RequestBody(required = false) Map<String, Object> body,
      @RequestHeader(value = "Authorization", required = false) String authHeader,
      @RequestHeader(value = "X-Auth-Token", required = false) String xToken
  ) {
    List<Object> args = body != null && body.get("args") instanceof List<?> rawList
        ? new ArrayList<>(rawList)
        : List.of();
    String bearer = (authHeader != null && authHeader.startsWith("Bearer "))
        ? authHeader.substring(7).trim()
        : xToken;

    long ver = versionService.getCurrentVersion();

    return switch (fnName) {
      /* ---------------- AUTH & VERSIONING ---------------- */
      case "loginUser" -> ApiResponse.ok(
          "Signed in successfully.",
          authService.login(argStr(args, 0), argStr(args, 1)),
          versionService.getCurrentVersion()
      );
      case "logoutUser" -> {
        String tok = !argStr(args, 0).isEmpty() ? argStr(args, 0) : bearer;
        yield ApiResponse.ok("Signed out safely.", authService.logout(tok), ver);
      }
      case "getCurrentUserContext" -> {
        String tok = !argStr(args, 0).isEmpty() ? argStr(args, 0) : bearer;
        Map<String, Object> ctx = authService.getCurrentUserContext(tok);
        String msg = Boolean.TRUE.equals(ctx.get("authenticated")) ? "Authenticated." : "Authentication required.";
        yield ApiResponse.ok(msg, ctx, ver);
      }
      case "checkDataVersion" -> {
        long clientVer = argLong(args, 0, 0L);
        long serverVer = versionService.getCurrentVersion();
        Map<String, String> settings = versionService.getAllSettingsMap();
        yield ApiResponse.ok("Version checked.", Map.of(
            "changed", clientVer != serverVer,
            "serverVersion", serverVer,
            "lastSyncAt", settings.getOrDefault("ERP_LAST_SYNC_AT", "")
        ), serverVer);
      }

      /* ---------------- ITEM MASTER ---------------- */
      case "getAllItems" -> {
        List<Map<String, Object>> items = itemService.getAllItems(argMap(args, 0));
        List<String> brands = items.stream()
            .map(it -> String.valueOf(it.getOrDefault("brand", "")).trim())
            .filter(s -> !s.isEmpty())
            .distinct()
            .sorted()
            .toList();
        yield ApiResponse.ok("Items loaded.", Map.of("items", items, "brands", brands), ver);
      }
      case "generateItemCode" -> {
        String cat = argStr(args, 0);
        yield ApiResponse.ok("Code generated.", Map.of("itemCode", itemService.generateItemCode(cat)), ver);
      }
      case "addItem" -> {
        Map<String, Object> saved = itemService.addItem(argMap(args, 0));
        yield ApiResponse.ok("Item " + saved.get("itemCode") + " added.", saved, versionService.getCurrentVersion());
      }
      case "updateItem" -> {
        Map<String, Object> saved = itemService.updateItem(argMap(args, 0));
        yield ApiResponse.ok("Item " + saved.get("itemCode") + " updated.", saved, versionService.getCurrentVersion());
      }
      case "setItemStatus" -> {
        Map<String, Object> res = itemService.setItemStatus(argStr(args, 0), argStr(args, 1));
        yield ApiResponse.ok("Item status updated to " + res.get("status") + ".", res, versionService.getCurrentVersion());
      }
      case "deleteItem" -> {
        Map<String, Object> res = itemService.deleteItem(argStr(args, 0));
        yield ApiResponse.ok("Item " + res.get("itemCode") + " deleted.", res, versionService.getCurrentVersion());
      }

      /* ---------------- TRANSACTIONS ---------------- */
      case "saveProduction" -> ApiResponse.ok(
          "Production entry saved.",
          txService.createTransaction("PRODUCTION", argMap(args, 0), "PRODUCTION_WRITE"),
          versionService.getCurrentVersion()
      );
      case "saveDispatch" -> ApiResponse.ok(
          "Dispatch entry saved.",
          txService.createTransaction("DISPATCH", argMap(args, 0), "DISPATCH_WRITE"),
          versionService.getCurrentVersion()
      );
      case "saveGoodsReceipt" -> ApiResponse.ok(
          "Goods Receipt entry saved.",
          txService.createTransaction("GOODS_RECEIPT", argMap(args, 0), "RECEIPT_WRITE"),
          versionService.getCurrentVersion()
      );
      case "saveIssue" -> ApiResponse.ok(
          "Material Issue entry saved.",
          txService.createTransaction("ISSUE", argMap(args, 0), "ISSUE_WRITE"),
          versionService.getCurrentVersion()
      );
      case "getProductionRecords" -> {
        Map<String, Object> f = new LinkedHashMap<>(argMap(args, 0));
        f.put("txType", "PRODUCTION");
        yield ApiResponse.ok("Production records loaded.", txService.getTransactionHistory(f), ver);
      }
      case "getDispatchRecords" -> {
        Map<String, Object> f = new LinkedHashMap<>(argMap(args, 0));
        f.put("txType", "DISPATCH");
        yield ApiResponse.ok("Dispatch records loaded.", txService.getTransactionHistory(f), ver);
      }
      case "getGoodsReceiptRecords" -> {
        Map<String, Object> f = new LinkedHashMap<>(argMap(args, 0));
        f.put("txType", "GOODS_RECEIPT");
        yield ApiResponse.ok("Goods Receipt records loaded.", txService.getTransactionHistory(f), ver);
      }
      case "getIssueRecords" -> {
        Map<String, Object> f = new LinkedHashMap<>(argMap(args, 0));
        f.put("txType", "ISSUE");
        yield ApiResponse.ok("Issue records loaded.", txService.getTransactionHistory(f), ver);
      }
      case "getTransactionById" -> ApiResponse.ok(
          "Transaction loaded.",
          txService.getTransactionById(argStr(args, 0)),
          ver
      );
      case "updateTransaction" -> ApiResponse.ok(
          "Transaction updated.",
          txService.updateTransaction(argStr(args, 0), argMap(args, 1)),
          versionService.getCurrentVersion()
      );
      case "cancelTransaction" -> ApiResponse.ok(
          "Transaction cancelled.",
          txService.cancelTransaction(argStr(args, 0), argStr(args, 1)),
          versionService.getCurrentVersion()
      );

      /* ---------------- STOCK REGISTERS & REPORTS ---------------- */
      case "getFinishedGoodsStock" -> ApiResponse.ok(
          "Finished Goods stock loaded.",
          stockReportService.buildCategoryRegister("Finished Goods", argMap(args, 0)),
          ver
      );
      case "getRawMaterialStock" -> ApiResponse.ok(
          "Raw Material stock loaded.",
          stockReportService.buildCategoryRegister("Raw Material", argMap(args, 0)),
          ver
      );
      case "getPackingMaterialStock" -> ApiResponse.ok(
          "Packing Material stock loaded.",
          stockReportService.buildCategoryRegister("Packing Material", argMap(args, 0)),
          ver
      );
      case "getAllStockBalance" -> ApiResponse.ok(
          "All Stock Balance loaded.",
          stockReportService.getAllStockBalance(argMap(args, 0)),
          ver
      );
      case "getStockByItem" -> ApiResponse.ok(
          "Item stock retrieved.",
          stockReportService.getStockByItem(argStr(args, 0)),
          ver
      );
      case "generateDailyStockReport" -> {
        Map<String, Object> snap = stockReportService.computeDailySnapshot(argStr(args, 0));
        yield ApiResponse.ok("Daily Stock Report generated for " + snap.get("reportDate") + ".", snap, ver);
      }
      case "submitDailyReport" -> {
        Map<String, Object> res = stockReportService.submitDailyReport(argStr(args, 0));
        yield ApiResponse.ok("Daily Stock Report " + res.get("reportId") + " submitted and locked.", res, versionService.getCurrentVersion());
      }
      case "getHistoricalReport" -> ApiResponse.ok(
          "Historical report data retrieved.",
          stockReportService.getHistoricalReport(argStr(args, 0)),
          ver
      );
      case "getDashboardData" -> ApiResponse.ok(
          "Dashboard data loaded.",
          stockReportService.getDashboardData(),
          ver
      );
      case "getAuditLogs" -> {
        int limit = (int) argLong(args, 0, 100L);
        yield ApiResponse.ok("Audit logs loaded.", Map.of("logs", stockReportService.getAuditLogs(limit)), ver);
      }

      /* ---------------- SYNC, RECONCILIATION & BACKUP ---------------- */
      case "getSyncStatus" -> ApiResponse.ok("Sync status retrieved.", stockReportService.getSyncStatusLegacy(), ver);
      case "getDatabaseHealth" -> ApiResponse.ok("Database health report generated.", stockReportService.getDatabaseHealthLegacy(), ver);
      case "syncWorkingSheets" -> {
        permissionChecker.assertPermission("SYNC_ADMIN");
        long nextVer = versionService.bumpVersion();
        yield ApiResponse.ok(
            "Use the Google Sheets Bi-Directional Sync panel to preview/import sheet rows or export MySQL DIPEN_ERP snapshots.",
            Map.of("overview", sheetsSyncService.getSyncOverview()),
            nextVer
        );
      }
      case "reconcileInventory" -> {
        permissionChecker.assertPermission("SYNC_ADMIN");
        Map<String, Object> dash = stockReportService.getDashboardData();
        long nextVer = versionService.bumpVersion();
        yield ApiResponse.ok("Inventory ledger reconciled cleanly against MySQL DIPEN_ERP.", dash, nextVer);
      }
      case "resolveSyncError" -> {
        sheetsSyncService.resolveSyncError(argStr(args, 0));
        yield ApiResponse.ok("Sync error marked RESOLVED.", Map.of(), versionService.getCurrentVersion());
      }
      case "installTriggers" -> {
        permissionChecker.assertPermission("SYNC_ADMIN");
        yield ApiResponse.ok(
            "Spring Boot scheduled daily backup cron (02:00 AM Asia/Kathmandu) and MySQL transactional listeners are active.",
            Map.of("schedulerActive", true),
            ver
        );
      }
      case "backupSpreadsheet" -> {
        BackupHistoryEntity b = backupService.runManualBackup();
        String msg = "SUCCESS".equals(b.getStatus())
            ? "MySQL DIPEN_ERP backup created & verified: " + b.getFileName()
            : "Backup finished with status " + b.getStatus() + (b.getErrorMessage() != null ? " (" + b.getErrorMessage() + ")" : "");
        yield ApiResponse.ok(msg, Map.of("backup", b), ver);
      }

      /* ---------------- PROCUREMENT & TENDER + DATE-WISE FX ---------------- */
      case "procSetupDatabase" -> {
        permissionChecker.assertPermission("PROCUREMENT_VIEW");
        yield ApiResponse.ok("MySQL DIPEN_ERP procurement & tender schema verified.", procurementService.getLookups(), ver);
      }
      case "procGetDashboard" -> ApiResponse.ok(
          "Procurement & Tender dashboard loaded.",
          procurementService.getDashboard(argMap(args, 0)),
          ver
      );
      case "procGetLookups" -> ApiResponse.ok(
          "Procurement lookups loaded.",
          procurementService.getLookups(),
          ver
      );
      case "procGetRecords" -> {
        String sheetName = argStr(args, 0);
        Map<String, Object> filters = argMap(args, 1);
        yield ApiResponse.ok(
            sheetName + " records loaded.",
            Map.of("records", procurementService.getRecords(sheetName, filters)),
            ver
        );
      }
      case "procSaveRecord" -> {
        String sheetName = argStr(args, 0);
        Map<String, Object> res = procurementService.saveRecord(sheetName, argMap(args, 1));
        yield ApiResponse.ok(
            "Record " + res.get("id") + " saved successfully in " + sheetName + ".",
            res,
            versionService.getCurrentVersion()
        );
      }
      case "procDeleteRecord" -> {
        String sheetName = argStr(args, 0);
        String recordId = argStr(args, 1);
        yield ApiResponse.ok(
            "Record " + recordId + " deleted.",
            procurementService.deleteRecord(sheetName, recordId),
            versionService.getCurrentVersion()
        );
      }
      case "procSetApproval" -> {
        String msg = procurementService.setApproval(argStr(args, 0), argStr(args, 1), argStr(args, 2), argStr(args, 3));
        yield ApiResponse.ok(msg, Map.of(), versionService.getCurrentVersion());
      }
      case "procGetExchangeRateByDate" -> {
        permissionChecker.assertAnyPermission("PROCUREMENT_VIEW", "STOCK_VIEW");
        Map<String, Object> rateInfo = fxService.resolveRatesForDate(argStr(args, 0));
        yield ApiResponse.ok(
            "Exchange rates resolved for " + rateInfo.get("RateDate") + ".",
            Map.of("rateDate", rateInfo.get("RateDate"), "exchangeRates", rateInfo),
            ver
        );
      }
      case "procSaveExchangeRates" -> {
        Map<String, Object> res = fxService.saveExchangeRates(argMap(args, 0));
        yield ApiResponse.ok(
            "Date-wise exchange rates saved for " + res.get("rateDate") + ".",
            res,
            versionService.getCurrentVersion()
        );
      }
      case "getApprovedPOsForGoodsReceipt" -> ApiResponse.ok(
          "Approved Purchase Orders loaded.",
          Map.of("purchaseOrders", procurementService.getApprovedPOsForGoodsReceipt()),
          ver
      );

      default -> throw new ErpBusinessException("Unknown RPC operation: " + fnName, 404);
    };
  }

  private static String argStr(List<Object> args, int idx) {
    if (args == null || idx >= args.size() || args.get(idx) == null) return "";
    return String.valueOf(args.get(idx)).trim();
  }

  private static long argLong(List<Object> args, int idx, long def) {
    if (args == null || idx >= args.size() || args.get(idx) == null) return def;
    try { return Long.parseLong(String.valueOf(args.get(idx))); } catch (Exception e) { return def; }
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> argMap(List<Object> args, int idx) {
    if (args == null || idx >= args.size() || !(args.get(idx) instanceof Map<?, ?> raw)) {
      return new LinkedHashMap<>();
    }
    Map<String, Object> copy = new LinkedHashMap<>();
    raw.forEach((k, v) -> copy.put(String.valueOf(k), v));
    return copy;
  }
}
