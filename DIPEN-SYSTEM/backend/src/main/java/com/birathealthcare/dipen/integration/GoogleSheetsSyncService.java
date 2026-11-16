package com.birathealthcare.dipen.integration;

import com.birathealthcare.dipen.entity.*;
import com.birathealthcare.dipen.exception.ErpBusinessException;
import com.birathealthcare.dipen.repository.*;
import com.birathealthcare.dipen.security.ErpPrincipal;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.birathealthcare.dipen.service.*;
import com.google.api.services.sheets.v4.Sheets;
import com.google.api.services.sheets.v4.model.ClearValuesRequest;
import com.google.api.services.sheets.v4.model.ValueRange;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class GoogleSheetsSyncService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");
  private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

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

  public Map<String, Object> previewImportFromSheet(String scope, String sheetName) {
    permissionChecker.assertAnyPermission("SYNC_ADMIN", "PROCUREMENT_WRITE", "RECEIPT_WRITE");
    String spreadsheetId = resolveSpreadsheetId(scope);
    List<List<Object>> values = readSheetRange(spreadsheetId, sheetName + "!A1:Z5000");
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
    List<List<Object>> values = readSheetRange(spreadsheetId, sheetName + "!A1:Z5000");

    int created = 0, updated = 0, skipped = 0, failed = 0;
    if (values.size() > 1) {
      List<String> headers = values.get(0).stream().map(v -> String.valueOf(v).trim()).toList();
      for (int i = 1; i < values.size(); i++) {
        Map<String, Object> rowMap = rowToMap(headers, values.get(i));
        if (rowMap.values().stream().allMatch(v -> String.valueOf(v).isBlank())) continue;
        try {
          String status = upsertSheetRow(scope, sheetName, rowMap, i + 1, actor);
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
    SheetsSyncLogEntity log = new SheetsSyncLogEntity();
    log.setSyncId("SYNC-" + System.currentTimeMillis());
    log.setDirection("IMPORT");
    log.setSpreadsheetScope(scope);
    log.setSheetName(sheetName);
    log.setActorEmail(actor.getEmail());
    log.setRowsProcessed(created + updated + skipped + failed);
    log.setRowsCreated(created);
    log.setRowsUpdated(updated);
    log.setRowsSkipped(skipped);
    log.setRowsFailed(failed);
    log.setStatus(failed == 0 ? "SUCCESS" : "PARTIAL_WITH_ERRORS");
    log.setSummary("Imported from " + sheetName + ": created=" + created + ", updated=" + updated + ", skipped=" + skipped + ", failed=" + failed);
    log.setCreatedAt(LocalDateTime.now(KTM));
    syncLogRepo.save(log);

    return Map.of(
        "syncId", log.getSyncId(),
        "created", created,
        "updated", updated,
        "skipped", skipped,
        "failed", failed,
        "status", log.getStatus()
    );
  }

  public Map<String, Object> exportToGoogleSheet(String scope, String sheetName) {
    ErpPrincipal actor = permissionChecker.assertAnyPermission("SYNC_ADMIN", "REPORT_GENERATE", "PROCUREMENT_VIEW");
    String spreadsheetId = resolveSpreadsheetId(scope);
    List<List<Object>> matrix = buildExportMatrix(scope, sheetName);

    Sheets client = clientProvider.createSheetsClient();
    try {
      String clearRange = "'" + sheetName + "'!A1:Z";
      client.spreadsheets().values().clear(spreadsheetId, clearRange, new ClearValuesRequest()).execute();
      ValueRange body = new ValueRange().setValues(matrix);
      client.spreadsheets().values()
          .update(spreadsheetId, "'" + sheetName + "'!A1", body)
          .setValueInputOption("USER_ENTERED")
          .execute();
    } catch (Exception ex) {
      throw new ErpBusinessException("Google Sheets export failed: " + ex.getMessage(), 502);
    }

    SheetsSyncLogEntity log = new SheetsSyncLogEntity();
    log.setSyncId("SYNC-" + System.currentTimeMillis());
    log.setDirection("EXPORT");
    log.setSpreadsheetScope(scope);
    log.setSheetName(sheetName);
    log.setActorEmail(actor.getEmail());
    log.setRowsProcessed(Math.max(0, matrix.size() - 1));
    log.setRowsCreated(Math.max(0, matrix.size() - 1));
    log.setStatus("SUCCESS");
    log.setSummary("Exported " + Math.max(0, matrix.size() - 1) + " rows from DIPEN_ERP to Google Sheet '" + sheetName + "'");
    log.setCreatedAt(LocalDateTime.now(KTM));
    syncLogRepo.save(log);

    return Map.of("syncId", log.getSyncId(), "sheetName", sheetName, "exportedRows", Math.max(0, matrix.size() - 1));
  }

  public Map<String, Object> getSyncOverview() {
    permissionChecker.assertAnyPermission("SYNC_ADMIN", "STOCK_VIEW");
    return Map.of(
        "googleSheetsConfigured", clientProvider.isConfigured(),
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
        fxService.saveExchangeRates(row);
        return "UPDATED";
      }
      Map<String, Object> res = procurementService.saveRecordInternal(sheetName, row, actor.getEmail());
      return Boolean.TRUE.equals(res.get("updated")) ? "UPDATED" : "CREATED";
    }
    if ("Item Master".equals(sheetName)) {
      Map<String, Object> payload = new LinkedHashMap<>();
      payload.put("itemCode", str(row.get("Item Code")));
      payload.put("itemName", str(row.get("Item Name")));
      payload.put("category", str(row.get("Categories")));
      payload.put("brand", str(row.get("Brand Categories")));
      payload.put("hsnCode", str(row.get("HSN Code")));
      payload.put("indexUnit", str(row.get("Index Unit")));
      payload.put("fractionOfIndexUnit", row.get("Fraction of Index Unit"));
      payload.put("conversionQty", row.get("Conversion Quantity"));
      payload.put("conversionUnit", str(row.get("Conversion Unit")));
      payload.put("reorderLevel", row.get("Reorder Level"));
      if (!str(payload.get("itemCode")).isEmpty() && itemRepo.existsById(str(payload.get("itemCode")))) {
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
    String txId = str(firstKey(row, "Production ID", "Dispatch ID", "Receipt ID", "Issue ID", "Transaction ID"));
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("txDate", firstKey(row, "Production Date", "Dispatch Date", "Receipt Date", "Issue Date", "Transaction Date"));
    payload.put("itemCode", row.get("Item Code"));
    payload.put("quantity", firstKey(row, "Quantity", "Dispatch Quantity", "Received Quantity", "Issue Quantity"));
    payload.put("uom", row.get("UOM"));
    payload.put("batchNo", row.get("Batch/Lot Number"));
    payload.put("refNo", firstKey(row, "Production Reference", "Challan Number", "Purchase Reference", "Issue Reference"));
    payload.put("partyOrSection", firstKey(row, "Customer/Party Name", "Supplier Name", "Department/Production Section"));
    payload.put("remarks", row.get("Remarks"));

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
    rows.add(List.of("Tx ID", "Tx Type", "Date", "Item Code", "Item Name", "Category", "Entered Qty", "UOM", "Base Qty", "Unit Rate", "Currency", "Exchange Rate", "Total NPR", "Party / Section", "Reference", "Status"));
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

  private static Map<String, Object> rowToMap(List<String> headers, List<Object> vals) {
    Map<String, Object> map = new LinkedHashMap<>();
    for (int i = 0; i < headers.size(); i++) {
      Object v = i < vals.size() ? vals.get(i) : "";
      map.put(headers.get(i), v != null ? v : "");
    }
    return map;
  }

  private static Object firstKey(Map<String, Object> m, String... keys) {
    for (String k : keys) {
      if (m.containsKey(k) && m.get(k) != null && !String.valueOf(m.get(k)).trim().isEmpty()) {
        return m.get(k);
      }
    }
    return "";
  }

  private static String str(Object v) { return v == null ? "" : String.valueOf(v).trim(); }
}
