package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.DailyReportEntity;
import com.birathealthcare.dipen.entity.ItemMasterEntity;
import com.birathealthcare.dipen.entity.StockLedgerEntity;
import com.birathealthcare.dipen.entity.SyncErrorEntity;
import com.birathealthcare.dipen.exception.ErpBusinessException;
import com.birathealthcare.dipen.repository.*;
import com.birathealthcare.dipen.security.ErpPrincipal;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class StockAndReportService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");
  private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  private final InventoryTransactionService txService;
  private final ItemMasterService itemService;
  private final ItemMasterRepository itemRepo;
  private final StockLedgerRepository ledgerRepo;
  private final DailyReportRepository reportRepo;
  private final SyncErrorRepository syncErrorRepo;
  private final OperationsAuditLogRepository auditRepo;
  private final SystemVersionService versionService;
  private final PermissionChecker permissionChecker;
  private final AuditService auditService;
  private final ObjectMapper objectMapper;

  public StockAndReportService(
      InventoryTransactionService txService,
      ItemMasterService itemService,
      ItemMasterRepository itemRepo,
      StockLedgerRepository ledgerRepo,
      DailyReportRepository reportRepo,
      SyncErrorRepository syncErrorRepo,
      OperationsAuditLogRepository auditRepo,
      SystemVersionService versionService,
      PermissionChecker permissionChecker,
      AuditService auditService,
      ObjectMapper objectMapper
  ) {
    this.txService = txService;
    this.itemService = itemService;
    this.itemRepo = itemRepo;
    this.ledgerRepo = ledgerRepo;
    this.reportRepo = reportRepo;
    this.syncErrorRepo = syncErrorRepo;
    this.auditRepo = auditRepo;
    this.versionService = versionService;
    this.permissionChecker = permissionChecker;
    this.auditService = auditService;
    this.objectMapper = objectMapper;
  }

  public Map<String, Object> buildCategoryRegister(String category, Map<String, Object> filters) {
    permissionChecker.assertPermission("STOCK_VIEW");
    String dateFilter = str(filters != null ? filters.get("date") : null);
    String monthFilter = str(filters != null ? filters.get("month") : null);
    String yearFilter = str(filters != null ? filters.get("year") : null);
    String brandFilter = str(filters != null ? filters.get("brand") : null);
    String q = str(filters != null ? filters.get("query") : null).toLowerCase();

    LocalDate asOf = resolveFilterEndDate(dateFilter, monthFilter, yearFilter);
    Map<String, InventoryTransactionService.StockBucket> stockMap = txService.calculateStockMap(asOf, null);
    List<Map<String, Object>> rows = new ArrayList<>();

    for (InventoryTransactionService.StockBucket b : stockMap.values()) {
      ItemMasterEntity it = b.item;
      if (category != null && !category.isEmpty() && !it.getCategory().equals(category)) continue;
      if (!brandFilter.isEmpty() && !(it.getBrand() != null && it.getBrand().equalsIgnoreCase(brandFilter))) continue;
      if (!q.isEmpty()) {
        String hay = (it.getItemCode() + " " + it.getItemName() + " " + (it.getBrand() != null ? it.getBrand() : "")).toLowerCase();
        if (!hay.contains(q)) continue;
      }

      ItemMasterService.DualUomBreakdown dual = itemService.decomposeToDualUom(it, b.closing);
      String stockStatus = b.closing.compareTo(BigDecimal.ZERO) <= 0 ? "Zero Balance"
          : (it.getReorderLevel().compareTo(BigDecimal.ZERO) > 0 && b.closing.compareTo(it.getReorderLevel()) <= 0 ? "Low Stock" : "In Stock");

      BigDecimal inQty = (asOf != null ? b.periodIn : b.totalIn);
      BigDecimal outQty = (asOf != null ? b.periodOut : b.totalOut);

      Map<String, Object> r = new LinkedHashMap<>();
      r.put("itemCode", it.getItemCode());
      r.put("itemName", it.getItemName());
      r.put("category", it.getCategory());
      r.put("brand", it.getBrand() != null ? it.getBrand() : "");
      r.put("indexUnit", it.getIndexUnit());
      r.put("openingStock", b.openingBeforeDate);
      r.put("stockIn", inQty);
      r.put("stockOut", outQty);
      r.put("totalIn", inQty);
      r.put("totalOut", outQty);
      r.put("closingStock", b.closing);
      r.put("hasSecondary", dual.hasSecondary());
      r.put("dualDisplay", dual.display());
      r.put("secondaryBalance", dual.display());
      r.put("reorderLevel", it.getReorderLevel());
      r.put("stockStatus", stockStatus);
      rows.add(r);
    }

    rows.sort(Comparator.comparing(m -> String.valueOf(m.get("itemCode"))));
    return Map.of("category", category != null ? category : "All", "rows", rows, "count", rows.size());
  }

  public Map<String, Object> getAllStockBalance(Map<String, Object> filters) {
    permissionChecker.assertPermission("STOCK_VIEW");
    String cat = filters != null && filters.get("category") != null ? str(filters.get("category")) : null;
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> rows = (List<Map<String, Object>>) buildCategoryRegister(cat, filters).get("rows");
    List<Map<String, Object>> fg = new ArrayList<>();
    List<Map<String, Object>> rm = new ArrayList<>();
    List<Map<String, Object>> pm = new ArrayList<>();
    List<Map<String, Object>> others = new ArrayList<>();
    for (Map<String, Object> r : rows) {
      String c = String.valueOf(r.get("category"));
      if ("Finished Goods".equals(c)) fg.add(r);
      else if ("Raw Material".equals(c)) rm.add(r);
      else if ("Packing Material".equals(c)) pm.add(r);
      else others.add(r);
    }
    Map<String, Object> sections = new LinkedHashMap<>();
    sections.put("finishedGoods", fg);
    sections.put("rawMaterial", rm);
    sections.put("packingMaterial", pm);
    sections.put("others", others);
    return Map.of("rows", rows, "sections", sections);
  }

  public Map<String, Object> getStockByItem(String itemCode) {
    permissionChecker.assertPermission("STOCK_VIEW");
    InventoryTransactionService.StockBucket b = txService.calculateStockMap(null, null).get(itemCode);
    if (b == null) throw new ErpBusinessException("Item not found: " + itemCode, 404);
    ItemMasterService.DualUomBreakdown dual = itemService.decomposeToDualUom(b.item, b.closing);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("itemCode", b.item.getItemCode());
    out.put("itemName", b.item.getItemName());
    out.put("category", b.item.getCategory());
    out.put("closingStock", b.closing);
    out.put("indexUnit", b.item.getIndexUnit());
    out.put("hasSecondary", dual.hasSecondary());
    out.put("dualDisplay", dual.display());
    out.put("secondaryQty", dual.secondaryQty());
    out.put("remainderQty", dual.remainderQty());
    out.put("reorderLevel", b.item.getReorderLevel());
    return out;
  }

  @SuppressWarnings("unchecked")
  public Map<String, Object> computeDailySnapshot(String reportDateStr) {
    permissionChecker.assertAnyPermission("REPORT_GENERATE", "STOCK_VIEW");
    LocalDate date = ExchangeRateService.parseDateOrToday(reportDateStr);
    String dStr = date.toString();

    List<Map<String, Object>> fg = (List<Map<String, Object>>) buildCategoryRegister("Finished Goods", Map.of("date", dStr)).get("rows");
    List<Map<String, Object>> rm = (List<Map<String, Object>>) buildCategoryRegister("Raw Material", Map.of("date", dStr)).get("rows");
    List<Map<String, Object>> pm = (List<Map<String, Object>>) buildCategoryRegister("Packing Material", Map.of("date", dStr)).get("rows");
    List<Map<String, Object>> all = new ArrayList<>();
    all.addAll(fg);
    all.addAll(rm);
    all.addAll(pm);

    int inCount = 0;
    int outCount = 0;
    for (StockLedgerEntity tx : ledgerRepo.findByStatusAndTxDate("ACTIVE", date)) {
      if ("IN".equalsIgnoreCase(tx.getDirection())) inCount++;
      else outCount++;
    }

    int belowReorder = 0;
    int zeroBalance = 0;
    for (Map<String, Object> row : all) {
      BigDecimal closing = toBd(row.get("closingStock"));
      BigDecimal reorder = toBd(row.get("reorderLevel"));
      if (closing.compareTo(BigDecimal.ZERO) <= 0) zeroBalance++;
      if (reorder.compareTo(BigDecimal.ZERO) > 0 && closing.compareTo(reorder) <= 0) belowReorder++;
    }

    Map<String, Object> summary = new LinkedHashMap<>();
    summary.put("totalActiveItems", all.size());
    summary.put("stockInTransactions", inCount);
    summary.put("stockOutTransactions", outCount);
    summary.put("belowReorderCount", belowReorder);
    summary.put("zeroBalanceCount", zeroBalance);

    Optional<DailyReportEntity> submittedOpt = reportRepo.findByReportDate(date);
    Map<String, Object> submittedInfo = null;
    if (submittedOpt.isPresent() && "SUBMITTED".equalsIgnoreCase(submittedOpt.get().getStatus())) {
      DailyReportEntity ent = submittedOpt.get();
      submittedInfo = Map.of(
          "reportId", ent.getReportId(),
          "submittedBy", ent.getSubmittedBy(),
          "submittedAt", ent.getSubmittedAt()
      );
    }

    Map<String, Object> snap = new LinkedHashMap<>();
    snap.put("reportDate", dStr);
    snap.put("generatedAt", LocalDateTime.now(KTM).format(DT_FMT));
    snap.put("finishedGoods", fg);
    snap.put("rawMaterial", rm);
    snap.put("packingMaterial", pm);
    snap.put("rows", all);
    snap.put("summary", summary);
    snap.put("totalActiveItems", all.size());
    snap.put("stockInCount", inCount);
    snap.put("stockOutCount", outCount);
    snap.put("belowReorderCount", belowReorder);
    snap.put("zeroBalanceCount", zeroBalance);
    snap.put("submittedInfo", submittedInfo);
    return snap;
  }

  @Transactional
  public Map<String, Object> submitDailyReport(String reportDateStr) {
    ErpPrincipal actor = permissionChecker.assertPermission("REPORT_SUBMIT");
    Map<String, Object> snap = computeDailySnapshot(reportDateStr);
    LocalDate date = LocalDate.parse(String.valueOf(snap.get("reportDate")));
    DailyReportEntity entity = reportRepo.findByReportDate(date).orElseGet(DailyReportEntity::new);
    if (entity.getReportId() == null) entity.setReportId("DSR-" + date.toString().replace("-", ""));
    entity.setReportDate(date);
    entity.setSubmittedBy(actor.getDisplayName());
    entity.setSubmittedAt(LocalDateTime.now(KTM).format(DT_FMT));
    entity.setTotalActiveItems((Integer) snap.get("totalActiveItems"));
    entity.setStockInCount((Integer) snap.get("stockInCount"));
    entity.setStockOutCount((Integer) snap.get("stockOutCount"));
    entity.setBelowReorderCount((Integer) snap.get("belowReorderCount"));
    entity.setZeroBalanceCount((Integer) snap.get("zeroBalanceCount"));
    try {
      entity.setSnapshotJson(objectMapper.writeValueAsString(snap));
    } catch (Exception e) {
      throw new ErpBusinessException("Failed to serialize snapshot");
    }
    entity.setStatus("SUBMITTED");
    reportRepo.save(entity);
    versionService.bumpVersion();
    auditService.logOperations(actor.getEmail(), actor.getRole(), "SUBMIT_DAILY_REPORT", "Daily Report", date.toString(),
        "Submitted daily stock snapshot for " + date, null, null);
    return Map.of(
        "reportId", entity.getReportId(),
        "reportDate", date.toString(),
        "submittedBy", entity.getSubmittedBy(),
        "submittedAt", entity.getSubmittedAt(),
        "snapshot", snap
    );
  }

  public Map<String, Object> getHistoricalReport(String reportDateStr) {
    permissionChecker.assertAnyPermission("REPORT_GENERATE", "STOCK_VIEW");
    List<DailyReportEntity> allReports = reportRepo.findAll();
    allReports.sort((a, b) -> b.getReportDate().compareTo(a.getReportDate()));

    List<Map<String, Object>> history = new ArrayList<>();
    for (DailyReportEntity r : allReports) {
      Map<String, Object> item = new LinkedHashMap<>();
      item.put("reportId", r.getReportId());
      item.put("reportDate", r.getReportDate().toString());
      item.put("submittedBy", r.getSubmittedBy());
      item.put("submittedAt", r.getSubmittedAt());
      item.put("totalActiveItems", r.getTotalActiveItems());
      item.put("stockInTransactions", r.getStockInCount());
      item.put("stockOutTransactions", r.getStockOutCount());
      item.put("belowReorderCount", r.getBelowReorderCount());
      item.put("zeroBalanceCount", r.getZeroBalanceCount());
      item.put("status", r.getStatus());
      history.add(item);
      if (history.size() >= 50) break;
    }

    Map<String, Object> matchedSnapshot = null;
    if (reportDateStr != null && !reportDateStr.isBlank()) {
      LocalDate date = ExchangeRateService.parseDateOrToday(reportDateStr);
      Optional<DailyReportEntity> opt = reportRepo.findByReportDate(date);
      if (opt.isPresent()) {
        try {
          matchedSnapshot = objectMapper.readValue(opt.get().getSnapshotJson(), new TypeReference<>() {});
          matchedSnapshot.put("submittedInfo", Map.of(
              "reportId", opt.get().getReportId(),
              "submittedBy", opt.get().getSubmittedBy(),
              "submittedAt", opt.get().getSubmittedAt()
          ));
        } catch (Exception ignored) {}
      }
      if (matchedSnapshot == null) {
        matchedSnapshot = computeDailySnapshot(date.toString());
      }
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("found", matchedSnapshot != null);
    out.put("history", history);
    out.put("snapshot", matchedSnapshot);
    return out;
  }

  public Map<String, Object> getDashboardData() {
    permissionChecker.assertPermission("STOCK_VIEW");
    Map<String, InventoryTransactionService.StockBucket> stockMap = txService.calculateStockMap(null, null);
    Map<String, BigDecimal> catSummary = new LinkedHashMap<>();
    for (String c : ItemMasterService.FIXED_CATEGORIES) catSummary.put(c, BigDecimal.ZERO);

    List<InventoryTransactionService.StockBucket> activeBuckets = new ArrayList<>();
    int activeItems = 0;
    int lowStockCount = 0;
    for (InventoryTransactionService.StockBucket b : stockMap.values()) {
      if ("Active".equalsIgnoreCase(b.item.getStatus())) {
        activeItems++;
        activeBuckets.add(b);
      }
      catSummary.put(b.item.getCategory(), catSummary.getOrDefault(b.item.getCategory(), BigDecimal.ZERO).add(b.closing).setScale(4, RoundingMode.HALF_UP));
      if (b.item.getReorderLevel().compareTo(BigDecimal.ZERO) > 0 && b.closing.compareTo(b.item.getReorderLevel()) <= 0) {
        lowStockCount++;
      }
    }

    LocalDate today = LocalDate.now(KTM);
    Map<String, BigDecimal[]> last14 = new LinkedHashMap<>();
    for (int d = 13; d >= 0; d--) {
      String ds = today.minusDays(d).toString();
      last14.put(ds, new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
    }

    Map<String, BigDecimal[]> monthly = new TreeMap<>();
    BigDecimal todayProd = BigDecimal.ZERO, todayRec = BigDecimal.ZERO, todayDisp = BigDecimal.ZERO, todayIss = BigDecimal.ZERO;

    List<StockLedgerEntity> allLedger = ledgerRepo.findAll();
    List<StockLedgerEntity> activeLedger = new ArrayList<>();
    for (StockLedgerEntity tx : allLedger) {
      if (!"ACTIVE".equalsIgnoreCase(tx.getStatus())) continue;
      activeLedger.add(tx);
      BigDecimal q = tx.getBaseQty();
      String dStr = tx.getTxDate().toString();
      if (tx.getTxDate().equals(today)) {
        switch (tx.getTxType()) {
          case "PRODUCTION" -> todayProd = todayProd.add(q);
          case "GOODS_RECEIPT" -> todayRec = todayRec.add(q);
          case "DISPATCH" -> todayDisp = todayDisp.add(q);
          case "ISSUE" -> todayIss = todayIss.add(q);
        }
      }
      if (last14.containsKey(dStr)) {
        BigDecimal[] arr = last14.get(dStr);
        switch (tx.getTxType()) {
          case "PRODUCTION" -> arr[0] = arr[0].add(q);
          case "DISPATCH" -> arr[1] = arr[1].add(q);
          case "GOODS_RECEIPT" -> arr[2] = arr[2].add(q);
          case "ISSUE" -> arr[3] = arr[3].add(q);
        }
      }
      String ym = dStr.substring(0, 7);
      BigDecimal[] mArr = monthly.computeIfAbsent(ym, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
      if ("IN".equalsIgnoreCase(tx.getDirection())) mArr[0] = mArr[0].add(q);
      else mArr[1] = mArr[1].add(q);
    }

    List<String> trendLabels = new ArrayList<>(last14.keySet());
    List<BigDecimal> dailyProduction = trendLabels.stream().map(k -> last14.get(k)[0]).toList();
    List<BigDecimal> dailyDispatch = trendLabels.stream().map(k -> last14.get(k)[1]).toList();
    List<BigDecimal> dailyReceipt = trendLabels.stream().map(k -> last14.get(k)[2]).toList();
    List<BigDecimal> dailyIssue = trendLabels.stream().map(k -> last14.get(k)[3]).toList();

    List<InventoryTransactionService.StockBucket> sortedTop = new ArrayList<>(activeBuckets);
    sortedTop.sort((a, b) -> b.closing.compareTo(a.closing));
    List<Map<String, Object>> top10Items = sortedTop.stream().limit(10).map(b -> {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("name", b.item.getItemName());
      m.put("code", b.item.getItemCode());
      m.put("qty", b.closing);
      m.put("unit", b.item.getIndexUnit());
      return m;
    }).toList();

    List<Map<String, Object>> lowList = activeBuckets.stream()
        .filter(b -> b.item.getReorderLevel().compareTo(BigDecimal.ZERO) > 0 && b.closing.compareTo(b.item.getReorderLevel()) <= 0)
        .limit(10)
        .map(b -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("name", b.item.getItemName());
          m.put("code", b.item.getItemCode());
          m.put("current", b.closing);
          m.put("reorder", b.item.getReorderLevel());
          return m;
        }).toList();

    List<String> allMonths = new ArrayList<>(monthly.keySet());
    List<String> monthlyLabels = allMonths.subList(Math.max(0, allMonths.size() - 6), allMonths.size());
    Map<String, Object> monthlyMovement = new LinkedHashMap<>();
    for (String ym : monthlyLabels) {
      BigDecimal[] arr = monthly.get(ym);
      monthlyMovement.put(ym, Map.of("stockIn", arr[0], "stockOut", arr[1]));
    }

    allLedger.sort((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()));
    List<Map<String, Object>> recent = allLedger.stream().limit(15)
        .map(tx -> txService.toDto(tx, itemRepo.findById(tx.getItemCode()).orElse(null)))
        .toList();

    long openErrors = syncErrorRepo.countByStatus("OPEN");

    Map<String, Object> cards = new LinkedHashMap<>();
    cards.put("totalActiveItems", activeItems);
    cards.put("finishedGoodsBalance", catSummary.get("Finished Goods"));
    cards.put("rawMaterialBalance", catSummary.get("Raw Material"));
    cards.put("packingMaterialBalance", catSummary.get("Packing Material"));
    cards.put("todayProduction", todayProd);
    cards.put("todayGoodsReceipt", todayRec);
    cards.put("todayDispatch", todayDisp);
    cards.put("todayIssue", todayIss);
    cards.put("lowStockItems", lowStockCount);
    cards.put("pendingSyncErrors", openErrors);

    Map<String, Object> charts = new LinkedHashMap<>();
    charts.put("dailyTrendLabels", trendLabels);
    charts.put("dailyProduction", dailyProduction);
    charts.put("dailyDispatch", dailyDispatch);
    charts.put("dailyReceipt", dailyReceipt);
    charts.put("dailyIssue", dailyIssue);
    charts.put("categorySummary", catSummary);
    charts.put("top10Items", top10Items);
    charts.put("lowStockAnalysis", lowList);
    charts.put("monthlyLabels", monthlyLabels);
    charts.put("monthlyMovement", monthlyMovement);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("cards", cards);
    out.put("charts", charts);
    out.put("recentActivity", recent);
    out.put("kpis", cards);
    out.put("categoryTotals", catSummary);
    return out;
  }

  public Map<String, Object> getSyncStatusLegacy() {
    permissionChecker.assertAnyPermission("SYNC_ADMIN", "STOCK_VIEW");
    List<SyncErrorEntity> openErrs = syncErrorRepo.findByStatusOrderByErrorTimestampDesc("OPEN");
    List<Map<String, Object>> errList = openErrs.stream().limit(100).map(e -> {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("errorId", e.getErrorId());
      m.put("timestamp", e.getErrorTimestamp());
      m.put("sheetName", e.getSheetName());
      m.put("sheetRow", e.getRowNumber());
      m.put("itemCode", e.getItemCode());
      m.put("message", e.getErrorMessage());
      m.put("status", e.getStatus());
      return m;
    }).toList();
    String lastSync = versionService.getAllSettingsMap().getOrDefault("ERP_LAST_SYNC_AT", LocalDateTime.now(KTM).format(DT_FMT));
    return Map.of(
        "lastSyncAt", lastSync,
        "dataVersion", versionService.getCurrentVersion(),
        "openErrorCount", errList.size(),
        "errors", errList
    );
  }

  public Map<String, Object> getDatabaseHealthLegacy() {
    permissionChecker.assertAnyPermission("SYNC_ADMIN", "STOCK_VIEW");
    long openErrors = syncErrorRepo.countByStatus("OPEN");
    long itemCount = itemRepo.count();
    long ledgerCount = ledgerRepo.count();
    long reportCount = reportRepo.count();
    List<Map<String, Object>> tables = List.of(
        Map.of("name", "item_master", "exists", true, "rows", itemCount),
        Map.of("name", "stock_ledger", "exists", true, "rows", ledgerCount),
        Map.of("name", "daily_reports", "exists", true, "rows", reportCount),
        Map.of("name", "sync_errors", "exists", true, "rows", openErrors)
    );
    return Map.of(
        "healthy", openErrors == 0,
        "databaseEngine", "MySQL 8.4 (DIPEN_ERP)",
        "sheets", tables,
        "openSyncErrors", openErrors,
        "lastSyncAt", versionService.getAllSettingsMap().getOrDefault("ERP_LAST_SYNC_AT", "")
    );
  }

  public List<Map<String, Object>> getAuditLogs(int limit) {
    permissionChecker.assertPermission("AUDIT_VIEW");
    return auditRepo.findAllByOrderByLogTimestampDesc().stream().limit(limit).map(a -> {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("auditId", a.getAuditId());
      m.put("timestamp", a.getLogTimestamp());
      m.put("user", a.getUserEmail());
      m.put("role", a.getUserRole());
      m.put("action", a.getAction());
      m.put("module", a.getModuleName());
      m.put("targetId", a.getTargetId());
      m.put("summary", a.getSummary());
      return m;
    }).toList();
  }

  private LocalDate resolveFilterEndDate(String dateFilter, String monthFilter, String yearFilter) {
    if (!dateFilter.isEmpty()) {
      return ExchangeRateService.parseDateOrToday(dateFilter);
    }
    if (!yearFilter.isEmpty() && !monthFilter.isEmpty()) {
      try {
        YearMonth ym = YearMonth.of(Integer.parseInt(yearFilter), Integer.parseInt(monthFilter));
        return ym.atEndOfMonth();
      } catch (Exception ignored) {}
    } else if (!yearFilter.isEmpty()) {
      try {
        return LocalDate.of(Integer.parseInt(yearFilter), 12, 31);
      } catch (Exception ignored) {}
    }
    return null;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v).trim();
  }

  private static BigDecimal toBd(Object v) {
    if (v instanceof BigDecimal bd) return bd;
    try { return v == null ? BigDecimal.ZERO : new BigDecimal(String.valueOf(v)); }
    catch (Exception e) { return BigDecimal.ZERO; }
  }
}
