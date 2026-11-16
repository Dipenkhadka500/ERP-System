package com.birathealthcare.dipen.integration;

import com.birathealthcare.dipen.entity.*;
import com.birathealthcare.dipen.exception.ErpBusinessException;
import com.birathealthcare.dipen.repository.*;
import com.birathealthcare.dipen.security.ErpPrincipal;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.birathealthcare.dipen.service.*;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class GoogleSheetsSyncService {

  private static final Logger log = LoggerFactory.getLogger(GoogleSheetsSyncService.class);
  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");
  private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private static final String HASH_PREFIX = "GS_HASH:";

  private static final List<String> OPS_IMPORT_TABS = List.of(
      "Item Master", "Production", "Dispatch", "Goods Reciept", "Issue"
  );
  private static final List<String> OPS_EXPORT_TABS = List.of(
      "Item Master", "Production", "Dispatch", "Goods Reciept", "Issue",
      "Finished Goods", "Raw Material", "Packing Material", "All Stock Balance"
  );
  private static final List<String> PROC_IMPORT_TABS = List.of(
      "ExchangeRates", "Indents", "Suppliers", "FreightForwarder",
      "Quotations", "PurchaseOrders", "LCTTPayments", "Shipments",
      "Tenders", "TenderTracking"
  );

  private static final List<String> SYSTEM_PERMS = List.of(
      "ITEM_MANAGE", "PRODUCTION_WRITE", "RECEIPT_WRITE", "DISPATCH_WRITE",
      "ISSUE_WRITE", "ISSUE_FG", "STOCK_VIEW", "REPORT_GENERATE",
      "REPORT_SUBMIT", "STOCK_ADJUST", "TX_EDIT", "TX_CANCEL",
      "NEGATIVE_OVERRIDE", "SYNC_ADMIN", "AUDIT_VIEW", "USER_MANAGE",
      "PROCUREMENT_VIEW", "PROCUREMENT_WRITE", "PROCUREMENT_APPROVE", "TENDER_WRITE"
  );

  private final AtomicBoolean syncLock = new AtomicBoolean(false);

  @Value("${dipen.google.auto-sync-enabled:true}")
  private boolean autoSyncEnabled;

  private final GoogleSheetsClientProvider clientProvider;
  private final ItemMasterRepository itemRepo;
  private final StockLedgerRepository ledgerRepo;
  private final ItemMasterService itemService;
  private final InventoryTransactionService txService;
  private final StockAndReportService stockReportService;
  private final ProcurementService procurementService;
  private final ExchangeRateService fxService;
  private final SyncErrorRepository syncErrorRepo;
  private final SheetsSyncLogRepository syncLogRepo;
  private final PermissionChecker permissionChecker;
  private final SystemVersionService versionService;

  public GoogleSheetsSyncService(
      GoogleSheetsClientProvider clientProvider,
      ItemMasterRepository itemRepo,
      StockLedgerRepository ledgerRepo,
      ItemMasterService itemService,
      InventoryTransactionService txService,
      StockAndReportService stockReportService,
      ProcurementService procurementService,
      ExchangeRateService fxService,
      SyncErrorRepository syncErrorRepo,
      SheetsSyncLogRepository syncLogRepo,
      PermissionChecker permissionChecker,
      SystemVersionService versionService
  ) {
    this.clientProvider = clientProvider;
    this.itemRepo = itemRepo;
    this.ledgerRepo = ledgerRepo;
    this.itemService = itemService;
    this.txService = txService;
    this.stockReportService = stockReportService;
    this.procurementService = procurementService;
    this.fxService = fxService;
    this.syncErrorRepo = syncErrorRepo;
    this.syncLogRepo = syncLogRepo;
    this.permissionChecker = permissionChecker;
    this.versionService = versionService;
  }

  /**
   * Automatic background sync pulling any rows entered/modified directly inside
   * Operations (1gGmpt4g...) or Procurement (16SN_MJj...) Google Sheets into MySQL DIPEN_ERP.
   */
  @Scheduled(fixedDelayString = "${dipen.google.auto-sync-interval-ms:30000}", initialDelay = 15000)
  public void scheduledAutoPullFromSheets() {
    if (!autoSyncEnabled || !clientProvider.isConfigured()) return;
    if (!syncLock.compareAndSet(false, true)) return;
    try {
      withSystemPrincipal(() -> {
        try {
          syncAllBidirectionalInternal(false);
        } catch (Exception ex) {
          log.warn("Scheduled Google Sheets auto-sync failed: {}", ex.getMessage());
        }
      });
    } finally {
      syncLock.set(false);
    }
  }

  /**
   * Automatically pushes ERP mutations to the matching Google Spreadsheet(s)
   * without blocking or rolling back the MySQL database commit.
   */
  @Async
  public void pushScopeAsync(String scope) {
    if (!autoSyncEnabled || !clientProvider.isConfigured()) return;
    if (!syncLock.compareAndSet(false, true)) return;
    try {
      withSystemPrincipal(() -> {
        try {
          if ("OPERATIONS".equalsIgnoreCase(scope) || "BOTH".equalsIgnoreCase(scope)) {
            for (String tab : OPS_EXPORT_TABS) {
              exportToGoogleSheetInternal("OPERATIONS", tab, "system-auto-sync");
            }
          }
          if ("PROCUREMENT".equalsIgnoreCase(scope) || "BOTH".equalsIgnoreCase(scope)) {
            for (String tab : PROC_IMPORT_TABS) {
              exportToGoogleSheetInternal("PROCUREMENT", tab, "system-auto-sync");
            }
          }
        } catch (Exception ex) {
          log.warn("Async Google Sheets push failed for {}: {}", scope, ex.getMessage());
          logSyncError(scope, 0, "", "Auto-push failed: " + ex.getMessage(), Map.of("scope", scope));
        }
      });
    } finally {
      syncLock.set(false);
    }
  }

  public Map<String, Object> syncAllBidirectionalNow() {
    ErpPrincipal actor = permissionChecker.assertPermission("SYNC_ADMIN");
    if (!clientProvider.isConfigured()) {
      throw new ErpBusinessException("Google Sheets credentials file is not configured. Set DIPEN_GOOGLE_CREDENTIALS_PATH.", 503);
    }
    if (!syncLock.compareAndSet(false, true)) {
      throw new ErpBusinessException("Google Sheets sync is already in progress. Please wait a few seconds.", 409);
    }
    try {
      return syncAllBidirectionalInternal(true);
    } finally {
      syncLock.set(false);
    }
  }

  private Map<String, Object> syncAllBidirectionalInternal(boolean forcePushAll) {
    ErpPrincipal actor = permissionChecker.currentPrincipal();
    Map<String, String> allSettings = versionService.getAllSettingsMap();
    int totalCreated = 0, totalUpdated = 0, totalSkipped = 0, totalFailed = 0;

    Sheets client = clientProvider.createSheetsClient();
    ensureTabsExist(client, clientProvider.getOperationsSpreadsheetId(), OPS_EXPORT_TABS);
    ensureTabsExist(client, clientProvider.getProcurementSpreadsheetId(), PROC_IMPORT_TABS);

    for (String tab : OPS_IMPORT_TABS) {
      Map<String, Object> r = pullIncrementalTab("OPERATIONS", tab, actor, allSettings);
      totalCreated += ((Number) r.get("created")).intValue();
      totalUpdated += ((Number) r.get("updated")).intValue();
      totalSkipped += ((Number) r.get("skipped")).intValue();
      totalFailed += ((Number) r.get("failed")).intValue();
    }
    for (String tab : PROC_IMPORT_TABS) {
      Map<String, Object> r = pullIncrementalTab("PROCUREMENT", tab, actor, allSettings);
      totalCreated += ((Number) r.get("created")).intValue();
      totalUpdated += ((Number) r.get("updated")).intValue();
      totalSkipped += ((Number) r.get("skipped")).intValue();
      totalFailed += ((Number) r.get("failed")).intValue();
    }

    if (forcePushAll || totalCreated > 0 || totalUpdated > 0) {
      for (String tab : OPS_EXPORT_TABS) {
        exportToGoogleSheetInternal("OPERATIONS", tab, actor.getEmail());
      }
      for (String tab : PROC_IMPORT_TABS) {
        exportToGoogleSheetInternal("PROCUREMENT", tab, actor.getEmail());
      }
    }

    if (totalCreated > 0 || totalUpdated > 0) {
      versionService.bumpVersion();
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("created", totalCreated);
    out.put("updated", totalUpdated);
    out.put("skipped", totalSkipped);
    out.put("failed", totalFailed);
    out.put("dataVersion", versionService.getCurrentVersion());
    return out;
  }

  private Map<String, Object> pullIncrementalTab(String scope, String sheetName, ErpPrincipal actor, Map<String, String> settings) {
    String spreadsheetId = resolveSpreadsheetId(scope);
    String actualTab = resolveExistingTabName(spreadsheetId, sheetName);
    List<List<Object>> values = readSheetRange(spreadsheetId, "'" + actualTab.replace("'", "''") + "'!A1:AZ10000");
    int created = 0, updated = 0, skipped = 0, failed = 0;

    if (values.size() > 1) {
      List<String> headers = values.get(0).stream().map(v -> String.valueOf(v).trim()).toList();
      for (int i = 1; i < values.size(); i++) {
        Map<String, Object> rowMap = rowToMap(headers, values.get(i));
        if (rowMap.values().stream().allMatch(v -> String.valueOf(v).isBlank())) continue;
        String rowKey = resolveRowPrimaryKey(scope, sheetName, rowMap, i + 1);
        String settingKey = HASH_PREFIX + scope + ":" + sheetName + ":" + rowKey;
        String rowHash = md5Hex(String.valueOf(rowMap));
        if (rowHash.equals(settings.get(settingKey))) {
          skipped++;
          continue;
        }
        try {
          String status = upsertSheetRow(scope, sheetName, rowMap, i + 1, actor);
          versionService.saveSetting(settingKey, rowHash, "Google Sheets sync row hash");
          if ("CREATED".equals(status)) created++;
          else if ("UPDATED".equals(status)) updated++;
          else skipped++;
        } catch (Exception ex) {
          failed++;
          logSyncError(sheetName, i + 1, str(firstKey(rowMap, "Item Code", "itemCode")), ex.getMessage(), rowMap);
        }
      }
    }

    if (created > 0 || updated > 0 || failed > 0) {
      SheetsSyncLogEntity syncLog = new SheetsSyncLogEntity();
      syncLog.setSyncId("SYNC-" + System.currentTimeMillis() + "-" + sheetName.hashCode());
      syncLog.setDirection("AUTO_IMPORT");
      syncLog.setSpreadsheetScope(scope);
      syncLog.setSheetName(sheetName);
      syncLog.setActorEmail(actor.getEmail());
      syncLog.setRowsProcessed(created + updated + skipped + failed);
      syncLog.setRowsCreated(created);
      syncLog.setRowsUpdated(updated);
      syncLog.setRowsSkipped(skipped);
      syncLog.setRowsFailed(failed);
      syncLog.setStatus(failed == 0 ? "SUCCESS" : "PARTIAL_WITH_ERRORS");
      syncLog.setSummary("Auto-synced from " + sheetName + ": created=" + created + ", updated=" + updated + ", skipped=" + skipped + ", failed=" + failed);
      syncLog.setCreatedAt(LocalDateTime.now(KTM));
      syncLogRepo.save(syncLog);
    }

    return Map.of("created", created, "updated", updated, "skipped", skipped, "failed", failed);
  }

  public Map<String, Object> previewImportFromSheet(String scope, String sheetName) {
    permissionChecker.assertAnyPermission("SYNC_ADMIN", "PROCUREMENT_WRITE", "RECEIPT_WRITE");
    String spreadsheetId = resolveSpreadsheetId(scope);
    List<List<Object>> values = readSheetRange(spreadsheetId, "'" + sheetName.replace("'", "''") + "'!A1:Z5000");
    if (values.size() <= 1) {
      return Map.of("sheetName", sheetName, "totalRows", 0, "newRows", 0, "updateRows", 0, "skippedRows", 0, "errorRows", List.of(), "preview", List.of());
    }

    List<String> headers = values.get(0).stream().map(v -> String.valueOf(v).trim()).toList();
    List<Map<String, Object>> preview = new ArrayList<>();
    List<Map<String, Object>> errors = new ArrayList<>();
    int newCount = 0, updCount = 0, skipCount = 0;

    for (int i = 1; i < values.size(); i++) {
      Map<String, Object> rowMap = rowToMap(headers, values.get(i));
      if (rowMap.values().stream().allMatch(v -> String.valueOf(v).isBlank())) continue;
      int rowNum = i + 1;

      try {
        String action = classifySheetRow(scope, sheetName, rowMap);
        if ("NEW".equals(action)) newCount++;
        else if ("UPDATE".equals(action)) updCount++;
        else skipCount++;
        rowMap.put("_rowNumber", rowNum);
        rowMap.put("_action", action);
        if (preview.size() < 100) preview.add(rowMap);
      } catch (Exception ex) {
        errors.add(Map.of("rowNumber", rowNum, "message", ex.getMessage(), "raw", rowMap));
      }
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("scope", scope);
    out.put("sheetName", sheetName);
    out.put("totalRows", values.size() - 1);
    out.put("newRows", newCount);
    out.put("updateRows", updCount);
    out.put("skippedRows", skipCount);
    out.put("errorCount", errors.size());
    out.put("errors", errors);
    out.put("preview", preview);
    return out;
  }

  @Transactional
  public Map<String, Object> commitImportFromSheet(String scope, String sheetName) {
    ErpPrincipal actor = permissionChecker.assertPermission("SYNC_ADMIN");
    String spreadsheetId = resolveSpreadsheetId(scope);
    List<List<Object>> values = readSheetRange(spreadsheetId, "'" + sheetName.replace("'", "''") + "'!A1:Z5000");

    int created = 0, updated = 0, skipped = 0, failed = 0;
    if (values.size() > 1) {
      List<String> headers = values.get(0).stream().map(v -> String.valueOf(v).trim()).toList();
      for (int i = 1; i < values.size(); i++) {
        Map<String, Object> rowMap = rowToMap(headers, values.get(i));
        if (rowMap.values().stream().allMatch(v -> String.valueOf(v).isBlank())) continue;
        try {
          String status = upsertSheetRow(scope, sheetName, rowMap, i + 1, actor);
          String rowKey = resolveRowPrimaryKey(scope, sheetName, rowMap, i + 1);
          versionService.saveSetting(HASH_PREFIX + scope + ":" + sheetName + ":" + rowKey, md5Hex(String.valueOf(rowMap)), "Google Sheets sync row hash");
          if ("CREATED".equals(status)) created++;
          else if ("UPDATED".equals(status)) updated++;
          else skipped++;
        } catch (Exception ex) {
          failed++;
          logSyncError(sheetName, i + 1, str(rowMap.get("Item Code")), ex.getMessage(), rowMap);
        }
      }
    }

    versionService.bumpVersion();
    SheetsSyncLogEntity logEntry = new SheetsSyncLogEntity();
    logEntry.setSyncId("SYNC-" + System.currentTimeMillis());
    logEntry.setDirection("IMPORT");
    logEntry.setSpreadsheetScope(scope);
    logEntry.setSheetName(sheetName);
    logEntry.setActorEmail(actor.getEmail());
    logEntry.setRowsProcessed(created + updated + skipped + failed);
    logEntry.setRowsCreated(created);
    logEntry.setRowsUpdated(updated);
    logEntry.setRowsSkipped(skipped);
    logEntry.setRowsFailed(failed);
    logEntry.setStatus(failed == 0 ? "SUCCESS" : "PARTIAL_WITH_ERRORS");
    logEntry.setSummary("Imported from " + sheetName + ": created=" + created + ", updated=" + updated + ", skipped=" + skipped + ", failed=" + failed);
    logEntry.setCreatedAt(LocalDateTime.now(KTM));
    syncLogRepo.save(logEntry);

    return Map.of(
        "syncId", logEntry.getSyncId(),
        "created", created,
        "updated", updated,
        "skipped", skipped,
        "failed", failed,
        "status", logEntry.getStatus()
    );
  }

  public Map<String, Object> exportToGoogleSheet(String scope, String sheetName) {
    ErpPrincipal actor = permissionChecker.assertAnyPermission("SYNC_ADMIN", "REPORT_GENERATE", "PROCUREMENT_VIEW");
    return exportToGoogleSheetInternal(scope, sheetName, actor.getEmail());
  }

  private Map<String, Object> exportToGoogleSheetInternal(String scope, String sheetName, String actorEmail) {
    String spreadsheetId = resolveSpreadsheetId(scope);
    List<List<Object>> matrix = buildExportMatrix(scope, sheetName);

    Sheets client = clientProvider.createSheetsClient();
    ensureTabsExist(client, spreadsheetId, List.of(sheetName));
    try {
      String escaped = sheetName.replace("'", "''");
      String clearRange = "'" + escaped + "'!A1:Z";
      client.spreadsheets().values().clear(spreadsheetId, clearRange, new ClearValuesRequest()).execute();
      if (!matrix.isEmpty()) {
        ValueRange body = new ValueRange().setValues(matrix);
        client.spreadsheets().values()
            .update(spreadsheetId, "'" + escaped + "'!A1", body)
            .setValueInputOption("USER_ENTERED")
            .execute();
      }
    } catch (Exception ex) {
      throw new ErpBusinessException("Google Sheets export failed: " + ex.getMessage(), 502);
    }

    SheetsSyncLogEntity logEntry = new SheetsSyncLogEntity();
    logEntry.setSyncId("SYNC-" + System.currentTimeMillis() + "-" + Math.abs(sheetName.hashCode() % 1000));
    logEntry.setDirection("EXPORT");
    logEntry.setSpreadsheetScope(scope);
    logEntry.setSheetName(sheetName);
    logEntry.setActorEmail(actorEmail);
    logEntry.setRowsProcessed(Math.max(0, matrix.size() - 1));
    logEntry.setRowsCreated(Math.max(0, matrix.size() - 1));
    logEntry.setStatus("SUCCESS");
    logEntry.setSummary("Exported " + Math.max(0, matrix.size() - 1) + " rows from DIPEN_ERP to Google Sheet '" + sheetName + "'");
    logEntry.setCreatedAt(LocalDateTime.now(KTM));
    syncLogRepo.save(logEntry);

    return Map.of("syncId", logEntry.getSyncId(), "sheetName", sheetName, "exportedRows", Math.max(0, matrix.size() - 1));
  }

  public Map<String, Object> getSyncOverview() {
    permissionChecker.assertAnyPermission("SYNC_ADMIN", "STOCK_VIEW");
    return Map.of(
        "googleSheetsConfigured", clientProvider.isConfigured(),
        "autoSyncEnabled", autoSyncEnabled,
        "operationsSpreadsheetId", clientProvider.getOperationsSpreadsheetId(),
        "procurementSpreadsheetId", clientProvider.getProcurementSpreadsheetId(),
        "openSyncErrors", syncErrorRepo.findByStatusOrderByErrorTimestampDesc("OPEN"),
        "recentSyncLogs", syncLogRepo.findAllByOrderByCreatedAtDesc().stream().limit(25).toList(),
        "dataVersion", versionService.getCurrentVersion()
    );
  }

  @Transactional
  public void resolveSyncError(String errorId) {
    ErpPrincipal actor = permissionChecker.assertPermission("SYNC_ADMIN");
    SyncErrorEntity err = syncErrorRepo.findById(errorId)
        .orElseThrow(() -> new ErpBusinessException("Sync error not found: " + errorId, 404));
    err.setStatus("RESOLVED");
    err.setResolvedBy(actor.getEmail());
    err.setResolvedAt(LocalDateTime.now(KTM).format(DT_FMT));
    syncErrorRepo.save(err);
  }

  private void ensureTabsExist(Sheets client, String spreadsheetId, List<String> requiredTabs) {
    try {
      Spreadsheet ss = client.spreadsheets().get(spreadsheetId).setFields("sheets.properties.title").execute();
      Set<String> existing = new HashSet<>();
      if (ss.getSheets() != null) {
        for (Sheet sh : ss.getSheets()) {
          if (sh.getProperties() != null && sh.getProperties().getTitle() != null) {
            existing.add(sh.getProperties().getTitle());
          }
        }
      }
      List<Request> reqs = new ArrayList<>();
      for (String tab : requiredTabs) {
        if (!existing.contains(tab)) {
          reqs.add(new Request().setAddSheet(new AddSheetRequest().setProperties(new SheetProperties().setTitle(tab))));
        }
      }
      if (!reqs.isEmpty()) {
        client.spreadsheets().batchUpdate(spreadsheetId, new BatchUpdateSpreadsheetRequest().setRequests(reqs)).execute();
      }
    } catch (Exception ex) {
      log.warn("Unable to inspect/create spreadsheet tabs for {}: {}", spreadsheetId, ex.getMessage());
    }
  }

  private void withSystemPrincipal(Runnable action) {
    ErpPrincipal principal = new ErpPrincipal(
        "system-sheets-sync@birathealthcare.com",
        "Google Sheets Auto-Sync",
        "Super Admin",
        "System Integration",
        "Active",
        SYSTEM_PERMS
    );
    var authorities = SYSTEM_PERMS.stream().map(SimpleGrantedAuthority::new).toList();
    var auth = new UsernamePasswordAuthenticationToken(principal, "SYSTEM_SYNC", authorities);
    var prev = SecurityContextHolder.getContext().getAuthentication();
    try {
      SecurityContextHolder.getContext().setAuthentication(auth);
      action.run();
    } finally {
      if (prev != null) {
        SecurityContextHolder.getContext().setAuthentication(prev);
      } else {
        SecurityContextHolder.clearContext();
      }
    }
  }

  private String resolveSpreadsheetId(String scope) {
    return "PROCUREMENT".equalsIgnoreCase(scope)
        ? clientProvider.getProcurementSpreadsheetId()
        : clientProvider.getOperationsSpreadsheetId();
  }

  private List<List<Object>> readSheetRange(String spreadsheetId, String range) {
    Sheets client = clientProvider.createSheetsClient();
    try {
      ValueRange res = client.spreadsheets().values().get(spreadsheetId, range).execute();
      return res.getValues() != null ? res.getValues() : List.of();
    } catch (Exception ex) {
      throw new ErpBusinessException("Unable to read Google Sheet range '" + range + "': " + ex.getMessage(), 502);
    }
  }

  private String resolveRowPrimaryKey(String scope, String sheetName, Map<String, Object> row, int rowNum) {
    if ("PROCUREMENT".equalsIgnoreCase(scope)) {
      String firstVal = row.values().stream().findFirst().map(String::valueOf).orElse("").trim();
      return firstVal.isEmpty() ? "ROW-" + rowNum : firstVal;
    }
    if ("Item Master".equals(sheetName)) {
      String c = str(row.get("Item Code"));
      return c.isEmpty() ? "ROW-" + rowNum : c;
    }
    String txId = str(firstKey(row, "Production ID", "Dispatch ID", "Receipt ID", "Issue ID", "Transaction ID"));
    return txId.isEmpty() ? "ROW-" + rowNum : txId;
  }

  private String classifySheetRow(String scope, String sheetName, Map<String, Object> row) {
    if ("PROCUREMENT".equalsIgnoreCase(scope)) {
      if ("ExchangeRates".equals(sheetName)) {
        LocalDate d = ExchangeRateService.parseDateOrToday(str(row.get("RateDate")));
        return fxService.getExchangeRateHistory().stream().anyMatch(r -> String.valueOf(r.get("RateDate")).equals(d.toString())) ? "UPDATE" : "NEW";
      }
      String firstVal = row.values().stream().findFirst().map(String::valueOf).orElse("").trim();
      if (firstVal.isEmpty()) return "NEW";
      boolean exists = procurementService.getRecords(sheetName, Map.of()).stream()
          .anyMatch(r -> firstVal.equals(String.valueOf(r.values().stream().findFirst().orElse(""))));
      return exists ? "UPDATE" : "NEW";
    }
    if ("Item Master".equals(sheetName)) {
      String code = str(row.get("Item Code"));
      if (str(row.get("Item Name")).isEmpty()) throw new ErpBusinessException("Missing Item Name");
      return !code.isEmpty() && itemRepo.existsById(code) ? "UPDATE" : "NEW";
    }
    String txId = str(firstKey(row, "Production ID", "Dispatch ID", "Receipt ID", "Issue ID", "Transaction ID"));
    String itemCode = str(row.get("Item Code"));
    if (itemCode.isEmpty() || !itemRepo.existsById(itemCode)) {
      throw new ErpBusinessException("Invalid or missing Item Code: " + itemCode);
    }
    return !txId.isEmpty() && ledgerRepo.existsById(txId) ? "UPDATE" : "NEW";
  }

  private String upsertSheetRow(String scope, String sheetName, Map<String, Object> row, int rowNum, ErpPrincipal actor) {
    if ("PROCUREMENT".equalsIgnoreCase(scope)) {
      if ("ExchangeRates".equals(sheetName)) {
        Map<String, Object> fxRow = new LinkedHashMap<>(row);
        if (!fxRow.containsKey("RateDate")) fxRow.put("RateDate", firstKey(row, "RateDate", "Rate Date", "Date"));
        fxService.saveExchangeRates(fxRow);
        return "UPDATED";
      }
      Map<String, Object> normalized = normalizeProcurementRow(row);
      Map<String, Object> res = procurementService.saveRecordInternal(sheetName, normalized, actor.getEmail());
      return Boolean.TRUE.equals(res.get("updated")) ? "UPDATED" : "CREATED";
    }
    if ("Item Master".equals(sheetName)) {
      Map<String, Object> payload = new LinkedHashMap<>();
      String code = str(firstKey(row, "Item Code", "itemCode", "Code"));
      payload.put("itemCode", code);
      payload.put("itemName", str(firstKey(row, "Item Name", "itemName", "Name")));
      payload.put("category", str(firstKey(row, "Categories", "Category", "Item Category", "category")));
      payload.put("brand", str(firstKey(row, "Brand Categories", "Brand", "Brand Name", "brand")));
      payload.put("hsnCode", str(firstKey(row, "HSN Code", "HSN", "hsnCode")));
      payload.put("indexUnit", str(firstKey(row, "Index Unit", "Base Unit", "Unit", "UOM", "indexUnit")));
      payload.put("fractionOfIndexUnit", firstKey(row, "Fraction of Index Unit", "fractionOfIndexUnit"));
      payload.put("conversionQty", firstKey(row, "Conversion Quantity", "Conversion Qty", "conversionQty"));
      payload.put("conversionUnit", str(firstKey(row, "Conversion Unit", "Secondary Unit", "conversionUnit")));
      payload.put("reorderLevel", firstKey(row, "Reorder Level", "Min Stock", "reorderLevel"));
      if (!code.isEmpty() && itemRepo.existsById(code)) {
        itemService.updateItem(payload);
        return "UPDATED";
      } else {
        itemService.addItem(payload);
        return "CREATED";
      }
    }

    String txType = switch (sheetName) {
      case "Production" -> "PRODUCTION";
      case "Dispatch" -> "DISPATCH";
      case "Goods Reciept" -> "GOODS_RECEIPT";
      case "Issue" -> "ISSUE";
      default -> throw new ErpBusinessException("Unsupported working sheet import: " + sheetName);
    };
    String txId = str(firstKey(row, "Production ID", "Dispatch ID", "Receipt ID", "GRN ID", "Issue ID", "Transaction ID", "txId"));
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("txDate", firstKey(row, "Production Date", "Dispatch Date", "Receipt Date", "Issue Date", "Transaction Date", "Date"));
    payload.put("itemCode", firstKey(row, "Item Code", "itemCode", "Code"));
    payload.put("quantity", firstKey(row, "Quantity", "Qty", "Dispatch Quantity", "Received Quantity", "Issue Quantity", "Entered Quantity"));
    payload.put("uom", firstKey(row, "UOM", "Unit", "Entered UOM"));
    payload.put("batchNo", firstKey(row, "Batch/Lot Number", "Batch Number", "Batch No"));
    payload.put("refNo", firstKey(row, "Production Reference", "Challan Number", "Purchase Reference", "Issue Reference", "Reference Number"));
    payload.put("partyOrSection", firstKey(row, "Customer/Party Name", "Supplier Name", "Department/Production Section", "Party / Section"));
    payload.put("remarks", firstKey(row, "Remarks"));

    Map<String, Object> meta = new LinkedHashMap<>();
    Object unitRate = firstKey(row, "Unit Rate", "Rate", "unitRate");
    Object currency = firstKey(row, "Currency", "currency");
    Object exRate = firstKey(row, "Exchange Rate", "exchangeRate");
    Object poNo = firstKey(row, "PO No", "PONo", "poNo");
    if (!str(unitRate).isEmpty()) meta.put("unitRate", unitRate);
    if (!str(currency).isEmpty()) meta.put("currency", currency);
    if (!str(exRate).isEmpty()) meta.put("exchangeRate", exRate);
    if (!str(poNo).isEmpty()) meta.put("poNo", poNo);
    if (!meta.isEmpty()) payload.put("meta", meta);

    if (!txId.isEmpty() && ledgerRepo.existsById(txId)) {
      txService.updateTransaction(txId, payload);
      return "UPDATED";
    }
    txService.createTransaction(txType, payload, switch (txType) {
      case "PRODUCTION" -> "PRODUCTION_WRITE";
      case "DISPATCH" -> "DISPATCH_WRITE";
      case "GOODS_RECEIPT" -> "RECEIPT_WRITE";
      default -> "ISSUE_WRITE";
    });
    return "CREATED";
  }

  private List<List<Object>> buildExportMatrix(String scope, String sheetName) {
    List<List<Object>> rows = new ArrayList<>();
    if ("PROCUREMENT".equalsIgnoreCase(scope)) {
      List<Map<String, Object>> recs = procurementService.getRecords(sheetName, Map.of());
      if (recs.isEmpty()) return rows;
      List<String> cols = new ArrayList<>(recs.get(0).keySet());
      rows.add(new ArrayList<>(cols));
      for (Map<String, Object> r : recs) {
        rows.add(cols.stream().map(c -> (Object) String.valueOf(r.getOrDefault(c, ""))).toList());
      }
      return rows;
    }

    if ("Item Master".equals(sheetName)) {
      rows.add(List.of("Item Code", "Item Name", "Categories", "Brand Categories", "HSN Code", "Index Unit",
          "Fraction of Index Unit", "Conversion Quantity", "Conversion Unit", "Reorder Level", "Status", "Created Date", "Updated Date"));
      for (Map<String, Object> it : itemService.getAllItems(Map.of())) {
        rows.add(List.of(it.get("itemCode"), it.get("itemName"), it.get("category"), it.get("brand"), it.get("hsnCode"),
            it.get("indexUnit"), it.get("fractionOfIndexUnit"), it.get("conversionQty"), it.get("conversionUnit"),
            it.get("reorderLevel"), it.get("status"), it.get("createdDate"), it.get("updatedDate")));
      }
      return rows;
    }

    if ("All Stock Balance".equals(sheetName) || "Finished Goods".equals(sheetName)
        || "Raw Material".equals(sheetName) || "Packing Material".equals(sheetName)) {
      String cat = "All Stock Balance".equals(sheetName) ? "" : sheetName;
      @SuppressWarnings("unchecked")
      List<Map<String, Object>> reg = (List<Map<String, Object>>) stockReportService.buildCategoryRegister(cat, Map.of()).get("rows");
      rows.add(List.of("Item Code", "Item Name", "Category", "Brand", "Index Unit", "Opening Stock", "Total In", "Total Out", "Closing Stock", "Secondary Unit Balance", "Reorder Level", "Stock Status"));
      for (Map<String, Object> r : reg) {
        rows.add(List.of(r.get("itemCode"), r.get("itemName"), r.get("category"), r.get("brand"), r.get("indexUnit"),
            r.get("openingStock"), r.get("totalIn"), r.get("totalOut"), r.get("closingStock"), r.get("secondaryBalance"),
            r.get("reorderLevel"), r.get("stockStatus")));
      }
      return rows;
    }

    String txType = switch (sheetName) {
      case "Production" -> "PRODUCTION";
      case "Dispatch" -> "DISPATCH";
      case "Goods Reciept" -> "GOODS_RECEIPT";
      case "Issue" -> "ISSUE";
      default -> "";
    };
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> txs = (List<Map<String, Object>>) txService.getTransactionHistory(Map.of("txType", txType, "page", 1, "pageSize", 5000)).get("records");
    rows.add(List.of("Transaction ID", "Transaction Type", "Transaction Date", "Item Code", "Item Name", "Category", "Quantity", "UOM", "Converted Base Qty", "Unit Rate", "Currency", "Exchange Rate", "Total NPR", "Party / Section", "Reference", "Status"));
    for (Map<String, Object> t : txs) {
      rows.add(List.of(t.get("txId"), t.get("txType"), t.get("txDate"), t.get("itemCode"), t.get("itemName"), t.get("category"),
          t.get("enteredQty"), t.get("enteredUom"), t.get("baseQty"), t.get("unitRate"), t.get("currency"), t.get("exchangeRate"),
          t.get("totalAmountNPR"), t.get("partyOrSection"), t.get("refNo"), t.get("status")));
    }
    return rows;
  }

  private void logSyncError(String sheetName, int rowNum, String itemCode, String msg, Map<String, Object> raw) {
    SyncErrorEntity e = new SyncErrorEntity();
    e.setErrorId("ERR-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
    e.setErrorTimestamp(LocalDateTime.now(KTM).format(DT_FMT));
    e.setSheetName(sheetName);
    e.setRowNumber(rowNum);
    e.setItemCode(itemCode);
    e.setErrorMessage(msg != null && msg.length() > 950 ? msg.substring(0, 950) : String.valueOf(msg));
    e.setRawDataJson(String.valueOf(raw));
    e.setStatus("OPEN");
    syncErrorRepo.save(e);
  }

  private static String md5Hex(String raw) {
    try {
      byte[] digest = MessageDigest.getInstance("MD5").digest(raw.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder();
      for (byte b : digest) sb.append(String.format("%02x", b));
      return sb.toString();
    } catch (Exception e) {
      return Integer.toHexString(raw.hashCode());
    }
  }

  private static Map<String, Object> rowToMap(List<String> headers, List<Object> vals) {
    Map<String, Object> map = new LinkedHashMap<>();
    for (int i = 0; i < headers.size(); i++) {
      Object v = i < vals.size() ? vals.get(i) : "";
      map.put(headers.get(i), v != null ? v : "");
    }
    return map;
  }

  private String resolveExistingTabName(String spreadsheetId, String canonicalName) {
    try {
      Sheets client = clientProvider.createSheetsClient();
      Spreadsheet ss = client.spreadsheets().get(spreadsheetId).setFields("sheets.properties.title").execute();
      if (ss.getSheets() != null) {
        List<String> titles = ss.getSheets().stream()
            .filter(s -> s.getProperties() != null && s.getProperties().getTitle() != null)
            .map(s -> s.getProperties().getTitle())
            .toList();
        if (titles.contains(canonicalName)) return canonicalName;
        if ("Goods Reciept".equals(canonicalName) && titles.contains("Goods Receipt")) return "Goods Receipt";
        String targetNorm = canonicalName.toLowerCase().replaceAll("[^a-z0-9]", "");
        for (String t : titles) {
          if (t.toLowerCase().replaceAll("[^a-z0-9]", "").equals(targetNorm)) return t;
        }
      }
    } catch (Exception ignored) {}
    return canonicalName;
  }

  private static Map<String, Object> normalizeProcurementRow(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<>(row);
    Map<String, String> canonical = Map.ofEntries(
        Map.entry("indentno", "IndentNo"),
        Map.entry("supplierid", "SupplierId"),
        Map.entry("forwarderid", "ForwarderId"),
        Map.entry("quotationno", "QuotationNo"),
        Map.entry("pono", "PONo"),
        Map.entry("paymentid", "PaymentId"),
        Map.entry("shipmentid", "ShipmentId"),
        Map.entry("tenderno", "TenderNo"),
        Map.entry("trackingid", "TrackingId"),
        Map.entry("orderdate", "OrderDate"),
        Map.entry("totalvalue", "TotalValue"),
        Map.entry("totalvaluenpr", "TotalValueNPR"),
        Map.entry("totalamount", "TotalAmount"),
        Map.entry("totalamountnpr", "TotalAmountNPR"),
        Map.entry("exchangerate", "ExchangeRate"),
        Map.entry("suppliername", "SupplierName"),
        Map.entry("tendername", "TenderName")
    );
    for (Map.Entry<String, Object> e : row.entrySet()) {
      String norm = e.getKey().toLowerCase().replaceAll("[^a-z0-9]", "");
      String targetKey = canonical.get(norm);
      if (targetKey != null && !out.containsKey(targetKey)) {
        out.put(targetKey, e.getValue());
      }
    }
    return out;
  }

  private static Object firstKey(Map<String, Object> m, String... keys) {
    for (String k : keys) {
      if (m.containsKey(k) && m.get(k) != null && !String.valueOf(m.get(k)).trim().isEmpty()) {
        return m.get(k);
      }
    }
    for (String k : keys) {
      String target = k.toLowerCase().replaceAll("[^a-z0-9]", "");
      for (Map.Entry<String, Object> e : m.entrySet()) {
        if (e.getKey() != null && e.getKey().toLowerCase().replaceAll("[^a-z0-9]", "").equals(target)
            && e.getValue() != null && !String.valueOf(e.getValue()).trim().isEmpty()) {
          return e.getValue();
        }
      }
    }
    return "";
  }

  private static String str(Object v) { return v == null ? "" : String.valueOf(v).trim(); }
}
