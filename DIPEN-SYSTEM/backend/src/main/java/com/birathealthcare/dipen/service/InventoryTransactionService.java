package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.ItemMasterEntity;
import com.birathealthcare.dipen.entity.StockLedgerEntity;
import com.birathealthcare.dipen.exception.ErpBusinessException;
import com.birathealthcare.dipen.repository.ItemMasterRepository;
import com.birathealthcare.dipen.repository.StockLedgerRepository;
import com.birathealthcare.dipen.security.ErpPrincipal;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class InventoryTransactionService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");
  private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private static final DateTimeFormatter COMPACT_DATE = DateTimeFormatter.ofPattern("yyyyMMdd");

  private static final Set<String> PRODUCTION_ALLOWED = Set.of("Finished Goods", "WIP", "Packing Material");
  private static final Set<String> DISPATCH_ALLOWED = Set.of("Finished Goods");
  private static final Set<String> ALL_SIX = Set.of("Raw Material", "Packing Material", "Finished Goods", "WIP", "Stores & Spares", "Others");

  private final StockLedgerRepository ledgerRepo;
  private final ItemMasterRepository itemRepo;
  private final ItemMasterService itemService;
  private final ExchangeRateService fxService;
  private final ProcurementService procurementService;
  private final PermissionChecker permissionChecker;
  private final SystemVersionService versionService;
  private final AuditService auditService;
  private final ObjectMapper objectMapper;

  public InventoryTransactionService(
      StockLedgerRepository ledgerRepo,
      ItemMasterRepository itemRepo,
      ItemMasterService itemService,
      ExchangeRateService fxService,
      ProcurementService procurementService,
      PermissionChecker permissionChecker,
      SystemVersionService versionService,
      AuditService auditService,
      ObjectMapper objectMapper
  ) {
    this.ledgerRepo = ledgerRepo;
    this.itemRepo = itemRepo;
    this.itemService = itemService;
    this.fxService = fxService;
    this.procurementService = procurementService;
    this.permissionChecker = permissionChecker;
    this.versionService = versionService;
    this.auditService = auditService;
    this.objectMapper = objectMapper;
  }

  public Map<String, StockBucket> calculateStockMap(LocalDate asOfDate, String excludeTxId) {
    Map<String, StockBucket> map = new LinkedHashMap<>();
    for (ItemMasterEntity it : itemRepo.findAll()) {
      map.put(it.getItemCode(), new StockBucket(it));
    }
    for (StockLedgerEntity tx : ledgerRepo.findByStatusOrderByTxDateAscCreatedAtAsc("ACTIVE")) {
      if (excludeTxId != null && excludeTxId.equals(tx.getTxId())) continue;
      if (asOfDate != null && tx.getTxDate().isAfter(asOfDate)) continue;

      StockBucket bucket = map.computeIfAbsent(tx.getItemCode(), k -> {
        ItemMasterEntity ghost = new ItemMasterEntity();
        ghost.setItemCode(tx.getItemCode());
        ghost.setItemName(tx.getItemName());
        ghost.setCategory(tx.getCategory());
        ghost.setBrand(tx.getBrand());
        ghost.setIndexUnit(tx.getEnteredUom());
        ghost.setStatus("Inactive");
        return new StockBucket(ghost);
      });

      BigDecimal qty = tx.getBaseQty();
      boolean isIn = "IN".equalsIgnoreCase(tx.getDirection());
      if (asOfDate != null) {
        if (tx.getTxDate().isBefore(asOfDate)) {
          bucket.openingBeforeDate = isIn ? bucket.openingBeforeDate.add(qty) : bucket.openingBeforeDate.subtract(qty);
        } else if (tx.getTxDate().isEqual(asOfDate)) {
          if (isIn) bucket.periodIn = bucket.periodIn.add(qty);
          else bucket.periodOut = bucket.periodOut.add(qty);
        }
      }
      if (isIn) bucket.totalIn = bucket.totalIn.add(qty);
      else bucket.totalOut = bucket.totalOut.add(qty);
      bucket.closing = bucket.totalIn.subtract(bucket.totalOut);
    }
    return map;
  }

  @Transactional
  public Map<String, Object> createTransaction(String txType, Map<String, Object> input, String requiredPerm) {
    ErpPrincipal actor = permissionChecker.assertPermission(requiredPerm);
    Map<String, String> settings = versionService.getAllSettingsMap();

    LocalDate txDate = parseRequiredDate(input.get("txDate"));
    String itemCode = str(input.get("itemCode"));
    if (itemCode.isEmpty()) throw new ErpBusinessException("Item Code must be selected from Item Master.");

    ItemMasterEntity item = itemRepo.findById(itemCode)
        .orElseThrow(() -> new ErpBusinessException("Item Code '" + itemCode + "' does not exist in Item Master."));
    if (!"Active".equalsIgnoreCase(item.getStatus())) {
      throw new ErpBusinessException("Item '" + item.getItemCode() + " - " + item.getItemName() + "' is Inactive and cannot be used in new transactions.");
    }

    validateCategoryRouting(txType, item, settings);

    String direction = ("PRODUCTION".equals(txType) || "GOODS_RECEIPT".equals(txType)) ? "IN" : "OUT";
    ItemMasterService.UomConversionResult conv = computeConversion(txType, item, input);

    if ("OUT".equals(direction)) {
      checkAvailableStock(item, conv.baseQty(), settings, actor, Boolean.TRUE.equals(input.get("allowNegativeOverride")), null);
    }

    String txId = generateTxId(txType);
    String nowStr = LocalDateTime.now(KTM).format(DT_FMT);
    RateMeta rateMeta = resolveRateMeta(txDate.toString(), conv.enteredQty(), extractMeta(input));

    StockLedgerEntity tx = new StockLedgerEntity();
    tx.setTxId(txId);
    tx.setTxType(txType);
    tx.setTxDate(txDate);
    tx.setItemCode(item.getItemCode());
    tx.setItemName(item.getItemName());
    tx.setCategory(item.getCategory());
    tx.setBrand(item.getBrand() != null ? item.getBrand() : "");
    tx.setEnteredQty(conv.enteredQty());
    tx.setEnteredUom(conv.enteredUom());
    tx.setBaseQty(conv.baseQty());
    tx.setDirection(direction);
    tx.setSourceSheet(sourceSheetForType(txType));
    tx.setBatchNo(str(input.get("batchNo")));
    tx.setRefNo(str(input.get("refNo")));
    tx.setPartyOrSection(str(input.get("partyOrSection")));
    tx.setSecondaryQty(decimalNullable(input.get("secondaryQty")));
    tx.setIndexQty(decimalNullable(input.get("indexQty")));
    tx.setInvoiceNo(str(input.get("invoiceNo")));
    tx.setChallanNo(str(input.get("challanNo")));
    tx.setVehicleNo(str(input.get("vehicleNo")));
    tx.setIssuedTo(str(input.get("issuedTo")));
    tx.setPoNo(str(rateMeta.meta().getOrDefault("poNo", input.getOrDefault("poNo", ""))));
    tx.setUnitRate(rateMeta.unitRate());
    tx.setCurrency(rateMeta.currency());
    tx.setExchangeRate(rateMeta.exchangeRate());
    tx.setTotalAmount(rateMeta.totalAmount());
    tx.setTotalAmountNpr(rateMeta.totalAmountNpr());
    tx.setMetaJson(writeJson(rateMeta.meta()));
    tx.setRemarks(str(input.get("remarks")));
    tx.setCreatedBy(actor.getDisplayName());
    tx.setCreatedAt(nowStr);
    tx.setUpdatedBy(actor.getDisplayName());
    tx.setUpdatedAt(nowStr);
    tx.setStatus("ACTIVE");
    tx.setSyncStatus("SYNCED");
    tx.setRecordHash(computeRecordHash(tx));
    ledgerRepo.save(tx);

    if ("GOODS_RECEIPT".equals(txType) && tx.getPoNo() != null && !tx.getPoNo().isBlank()) {
      procurementService.tryUpdatePOReceiptProgress(tx.getPoNo(), conv.baseQty(), actor.getEmail());
    }

    versionService.bumpVersion();
    Map<String, Object> dto = toDto(tx, item);
    auditService.logOperations(actor.getEmail(), actor.getRole(), "CREATE_" + txType, sourceSheetForType(txType),
        txId, txType + " " + conv.baseQty().stripTrailingZeros().toPlainString() + " " + item.getIndexUnit(), null, dto);
    return dto;
  }

  @Transactional
  public Map<String, Object> updateTransaction(String txId, Map<String, Object> updates) {
    ErpPrincipal actor = permissionChecker.assertPermission("TX_EDIT");
    StockLedgerEntity tx = ledgerRepo.findById(txId)
        .orElseThrow(() -> new ErpBusinessException("Transaction '" + txId + "' not found.", 404));
    if (!"ACTIVE".equalsIgnoreCase(tx.getStatus())) {
      throw new ErpBusinessException("Cancelled transactions cannot be edited.");
    }
    ItemMasterEntity item = itemRepo.findById(tx.getItemCode())
        .orElseThrow(() -> new ErpBusinessException("Item Master record missing for transaction.", 404));

    Map<String, Object> before = toDto(tx, item);
    LocalDate nextDate = updates.containsKey("txDate") && !str(updates.get("txDate")).isEmpty()
        ? parseRequiredDate(updates.get("txDate")) : tx.getTxDate();
    BigDecimal nextEnteredQty = updates.containsKey("quantity") ? decimalRequiredPositive(updates.get("quantity")) : tx.getEnteredQty();
    String nextUom = updates.containsKey("uom") && !str(updates.get("uom")).isEmpty() ? str(updates.get("uom")) : tx.getEnteredUom();
    ItemMasterService.UomConversionResult conv = itemService.convertToBaseUnit(item, nextEnteredQty, nextUom);

    if ("OUT".equalsIgnoreCase(tx.getDirection())) {
      checkAvailableStock(item, conv.baseQty(), versionService.getAllSettingsMap(), actor,
          Boolean.TRUE.equals(updates.get("allowNegativeOverride")), txId);
    }

    Map<String, Object> mergedMeta = parseJson(tx.getMetaJson());
    mergedMeta.putAll(extractMeta(updates));
    RateMeta rateMeta = resolveRateMeta(nextDate.toString(), conv.enteredQty(), mergedMeta);

    tx.setTxDate(nextDate);
    tx.setEnteredQty(conv.enteredQty());
    tx.setEnteredUom(conv.enteredUom());
    tx.setBaseQty(conv.baseQty());
    if (updates.containsKey("batchNo")) tx.setBatchNo(str(updates.get("batchNo")));
    if (updates.containsKey("refNo")) tx.setRefNo(str(updates.get("refNo")));
    if (updates.containsKey("partyOrSection")) tx.setPartyOrSection(str(updates.get("partyOrSection")));
    if (updates.containsKey("remarks")) tx.setRemarks(str(updates.get("remarks")));
    tx.setUnitRate(rateMeta.unitRate());
    tx.setCurrency(rateMeta.currency());
    tx.setExchangeRate(rateMeta.exchangeRate());
    tx.setTotalAmount(rateMeta.totalAmount());
    tx.setTotalAmountNpr(rateMeta.totalAmountNpr());
    tx.setMetaJson(writeJson(rateMeta.meta()));
    tx.setUpdatedBy(actor.getDisplayName());
    tx.setUpdatedAt(LocalDateTime.now(KTM).format(DT_FMT));
    tx.setRecordHash(computeRecordHash(tx));
    ledgerRepo.save(tx);

    versionService.bumpVersion();
    Map<String, Object> after = toDto(tx, item);
    auditService.logOperations(actor.getEmail(), actor.getRole(), "UPDATE_TX", sourceSheetForType(tx.getTxType()),
        txId, "Updated transaction " + txId, before, after);
    return after;
  }

  @Transactional
  public Map<String, Object> cancelTransaction(String txId, String reason) {
    ErpPrincipal actor = permissionChecker.assertPermission("TX_CANCEL");
    StockLedgerEntity tx = ledgerRepo.findById(txId)
        .orElseThrow(() -> new ErpBusinessException("Transaction '" + txId + "' not found.", 404));
    if ("CANCELLED".equalsIgnoreCase(tx.getStatus())) {
      throw new ErpBusinessException("Transaction '" + txId + "' is already cancelled.");
    }
    tx.setStatus("CANCELLED");
    tx.setRemarks((tx.getRemarks() != null && !tx.getRemarks().isBlank() ? tx.getRemarks() + " | " : "")
        + "[CANCELLED: " + (reason == null || reason.isBlank() ? "Cancelled by user" : reason.trim()) + "]");
    tx.setUpdatedBy(actor.getDisplayName());
    tx.setUpdatedAt(LocalDateTime.now(KTM).format(DT_FMT));
    tx.setRecordHash(computeRecordHash(tx));
    ledgerRepo.save(tx);

    versionService.bumpVersion();
    auditService.logOperations(actor.getEmail(), actor.getRole(), "CANCEL_TX", sourceSheetForType(tx.getTxType()),
        txId, "Cancelled transaction " + txId, null, Map.of("reason", reason == null ? "" : reason));
    return Map.of("txId", txId, "status", "CANCELLED");
  }

  public Map<String, Object> getTransactionById(String txId) {
    StockLedgerEntity tx = ledgerRepo.findById(txId)
        .orElseThrow(() -> new ErpBusinessException("Transaction not found.", 404));
    ItemMasterEntity item = itemRepo.findById(tx.getItemCode()).orElse(null);
    return Map.of("transaction", toDto(tx, item));
  }

  public Map<String, Object> getTransactionHistory(Map<String, Object> filters) {
    String txType = str(filters != null ? filters.get("txType") : null);
    String startDate = str(filters != null ? filters.get("startDate") : null);
    String endDate = str(filters != null ? filters.get("endDate") : null);
    String q = str(filters != null ? filters.get("query") : null).toLowerCase();
    int page = intOr(filters != null ? filters.get("page") : null, 1);
    int pageSize = intOr(filters != null ? filters.get("pageSize") : null, 25);

    List<StockLedgerEntity> raw = txType.isEmpty()
        ? ledgerRepo.findAll()
        : ledgerRepo.findByTxTypeOrderByTxDateDescCreatedAtDesc(txType);

    raw.sort((a, b) -> {
      int cmp = b.getTxDate().compareTo(a.getTxDate());
      return cmp != 0 ? cmp : b.getCreatedAt().compareTo(a.getCreatedAt());
    });

    Map<String, ItemMasterEntity> itemMap = new HashMap<>();
    itemRepo.findAll().forEach(it -> itemMap.put(it.getItemCode(), it));

    List<Map<String, Object>> filtered = new ArrayList<>();
    for (StockLedgerEntity tx : raw) {
      if (!startDate.isEmpty() && tx.getTxDate().toString().compareTo(startDate) < 0) continue;
      if (!endDate.isEmpty() && tx.getTxDate().toString().compareTo(endDate) > 0) continue;
      if (!q.isEmpty()) {
        String hay = (tx.getTxId() + " " + tx.getItemCode() + " " + tx.getItemName() + " " + tx.getRefNo() + " " + tx.getPartyOrSection()).toLowerCase();
        if (!hay.contains(q)) continue;
      }
      filtered.add(toDto(tx, itemMap.get(tx.getItemCode())));
    }

    int total = filtered.size();
    int from = Math.min(Math.max(0, (page - 1) * pageSize), total);
    int to = Math.min(from + pageSize, total);
    return Map.of(
        "records", filtered.subList(from, to),
        "total", total,
        "page", page,
        "pageSize", pageSize
    );
  }

  private void validateCategoryRouting(String txType, ItemMasterEntity item, Map<String, String> settings) {
    String cat = item.getCategory();
    switch (txType) {
      case "PRODUCTION" -> {
        if ("TRUE".equalsIgnoreCase(settings.get("PRODUCTION_STRICT_FG_ONLY")) && !"Finished Goods".equals(cat)) {
          throw new ErpBusinessException("Invalid Production classification: Item '" + item.getItemName() + "' belongs to '" + cat + "', not Finished Goods.");
        }
        if (!PRODUCTION_ALLOWED.contains(cat)) {
          throw new ErpBusinessException("Category '" + cat + "' is not permitted in Production.");
        }
      }
      case "DISPATCH" -> {
        if (!DISPATCH_ALLOWED.contains(cat)) {
          throw new ErpBusinessException("Dispatch only supports Finished Goods. '" + item.getItemName() + "' is in '" + cat + "'.");
        }
      }
      case "GOODS_RECEIPT" -> {
        if (!ALL_SIX.contains(cat)) throw new ErpBusinessException("Category '" + cat + "' is not permitted in Goods Receipt.");
      }
      case "ISSUE" -> {
        if ("Finished Goods".equals(cat) && !"TRUE".equalsIgnoreCase(settings.get("AUTHORIZE_FG_ISSUE"))) {
          throw new ErpBusinessException("Issuing Finished Goods requires explicit authorization in System Settings.");
        }
        if (!ALL_SIX.contains(cat)) throw new ErpBusinessException("Category '" + cat + "' is not permitted in Issue.");
      }
    }
  }

  private ItemMasterService.UomConversionResult computeConversion(String txType, ItemMasterEntity item, Map<String, Object> input) {
    BigDecimal sec = decimalOrZero(input.get("secondaryQty"));
    BigDecimal idx = decimalOrZero(input.get("indexQty"));
    BigDecimal directQty = decimalOrZero(input.get("quantity"));
    if ("DISPATCH".equals(txType) && (sec.compareTo(BigDecimal.ZERO) > 0 || idx.compareTo(BigDecimal.ZERO) > 0)
        && directQty.compareTo(BigDecimal.ZERO) <= 0) {
      BigDecimal convFactor = item.getConversionQty() != null && item.getConversionQty().compareTo(BigDecimal.ZERO) > 0
          ? item.getConversionQty() : BigDecimal.ONE;
      BigDecimal totalBase = sec.multiply(convFactor).add(idx).setScale(4, RoundingMode.HALF_UP);
      return itemService.convertToBaseUnit(item, totalBase, item.getIndexUnit());
    }
    return itemService.convertToBaseUnit(item, directQty, str(input.get("uom")));
  }

  private void checkAvailableStock(ItemMasterEntity item, BigDecimal neededBase, Map<String, String> settings,
                                   ErpPrincipal actor, boolean requestedOverride, String excludeTxId) {
    StockBucket bucket = calculateStockMap(null, excludeTxId).get(item.getItemCode());
    BigDecimal available = bucket != null ? bucket.closing : BigDecimal.ZERO;
    if (available.compareTo(neededBase) < 0) {
      boolean canOverride = requestedOverride
          && actor.hasPermission("NEGATIVE_OVERRIDE")
          && "TRUE".equalsIgnoreCase(settings.getOrDefault("ALLOW_NEGATIVE_STOCK_OVERRIDE", "FALSE"));
      if (!canOverride) {
        throw new ErpBusinessException("Insufficient stock for " + item.getItemCode() + " (" + item.getItemName()
            + "). Available: " + available.stripTrailingZeros().toPlainString() + " " + item.getIndexUnit()
            + ", Required: " + neededBase.stripTrailingZeros().toPlainString() + " " + item.getIndexUnit() + ".");
      }
    }
  }

  private RateMeta resolveRateMeta(String dateStr, BigDecimal enteredQty, Map<String, Object> metaIn) {
    Map<String, Object> meta = new LinkedHashMap<>(metaIn != null ? metaIn : Map.of());
    BigDecimal unitRate = decimalOrZero(meta.get("unitRate"));
    String currency = str(meta.get("currency")).toUpperCase();
    if (currency.isEmpty()) currency = "NPR";
    BigDecimal exRate = decimalOrZero(meta.get("exchangeRate"));
    if (exRate.compareTo(BigDecimal.ZERO) <= 0) {
      exRate = "NPR".equals(currency) ? BigDecimal.ONE : fxService.getRateForCurrency(fxService.resolveRatesForDate(dateStr), currency);
    }
    BigDecimal totalAmount = enteredQty.multiply(unitRate).setScale(4, RoundingMode.HALF_UP);
    BigDecimal totalAmountNpr = totalAmount.multiply(exRate).setScale(2, RoundingMode.HALF_UP);
    meta.put("unitRate", unitRate);
    meta.put("currency", currency);
    meta.put("exchangeRate", exRate);
    meta.put("totalAmount", totalAmount);
    meta.put("totalAmountNPR", totalAmountNpr);
    return new RateMeta(unitRate, currency, exRate, totalAmount, totalAmountNpr, meta);
  }

  private String generateTxId(String txType) {
    String prefix = switch (txType) {
      case "PRODUCTION" -> "PRD";
      case "GOODS_RECEIPT" -> "GRN";
      case "DISPATCH" -> "DSP";
      case "ISSUE" -> "ISS";
      default -> "TRX";
    };
    String datePart = LocalDate.now(KTM).format(COMPACT_DATE);
    Set<String> existing = new HashSet<>();
    int maxSeq = 0;
    for (StockLedgerEntity tx : ledgerRepo.findAll()) {
      existing.add(tx.getTxId());
      String[] parts = tx.getTxId().split("-");
      if (parts.length >= 3 && prefix.equals(parts[0])) {
        try {
          int seq = Integer.parseInt(parts[parts.length - 1]);
          if (seq > maxSeq) maxSeq = seq;
        } catch (NumberFormatException ignored) {}
      }
    }
    int seq = maxSeq + 1;
    String candidate = String.format("%s-%s-%04d", prefix, datePart, seq);
    while (existing.contains(candidate)) {
      seq++;
      candidate = String.format("%s-%s-%04d", prefix, datePart, seq);
    }
    return candidate;
  }

  public Map<String, Object> toDto(StockLedgerEntity tx, ItemMasterEntity item) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("txId", tx.getTxId());
    m.put("txType", tx.getTxType());
    m.put("txDate", tx.getTxDate().toString());
    m.put("itemCode", tx.getItemCode());
    m.put("itemName", tx.getItemName());
    m.put("category", tx.getCategory());
    m.put("brand", tx.getBrand() != null ? tx.getBrand() : "");
    m.put("enteredQty", tx.getEnteredQty());
    m.put("enteredUom", tx.getEnteredUom());
    m.put("baseQty", tx.getBaseQty());
    m.put("direction", tx.getDirection());
    m.put("sourceSheet", tx.getSourceSheet());
    m.put("batchNo", tx.getBatchNo() != null ? tx.getBatchNo() : "");
    m.put("refNo", tx.getRefNo() != null ? tx.getRefNo() : "");
    m.put("partyOrSection", tx.getPartyOrSection() != null ? tx.getPartyOrSection() : "");
    m.put("meta", parseJson(tx.getMetaJson()));
    m.put("unitRate", tx.getUnitRate());
    m.put("currency", tx.getCurrency());
    m.put("exchangeRate", tx.getExchangeRate());
    m.put("totalAmount", tx.getTotalAmount());
    m.put("totalAmountNPR", tx.getTotalAmountNpr());
    m.put("remarks", tx.getRemarks() != null ? tx.getRemarks() : "");
    m.put("createdBy", tx.getCreatedBy());
    m.put("createdAt", tx.getCreatedAt());
    m.put("updatedBy", tx.getUpdatedBy());
    m.put("updatedAt", tx.getUpdatedAt());
    m.put("status", tx.getStatus());
    m.put("indexUnit", item != null ? item.getIndexUnit() : tx.getEnteredUom());
    m.put("dualDisplay", item != null ? itemService.formatDualUom(item, tx.getBaseQty()) : tx.getBaseQty() + " " + tx.getEnteredUom());
    return m;
  }

  public static String computeRecordHash(StockLedgerEntity tx) {
    String raw = String.join("|",
        tx.getTxId(), tx.getTxType(), tx.getTxDate().toString(), tx.getItemCode(),
        tx.getEnteredQty().stripTrailingZeros().toPlainString(), tx.getEnteredUom(), tx.getDirection(), tx.getStatus());
    try {
      byte[] digest = MessageDigest.getInstance("MD5").digest(raw.getBytes(StandardCharsets.UTF_8));
      StringBuilder sb = new StringBuilder();
      for (byte b : digest) sb.append(String.format("%02x", b));
      return sb.toString();
    } catch (Exception e) {
      return Integer.toHexString(raw.hashCode());
    }
  }

  private static String sourceSheetForType(String txType) {
    return switch (txType) {
      case "PRODUCTION" -> "Production";
      case "DISPATCH" -> "Dispatch";
      case "GOODS_RECEIPT" -> "Goods Reciept";
      case "ISSUE" -> "Issue";
      default -> "Web App";
    };
  }

  private Map<String, Object> extractMeta(Map<String, Object> input) {
    if (input == null || !(input.get("meta") instanceof Map<?, ?> m)) return new LinkedHashMap<>();
    Map<String, Object> copy = new LinkedHashMap<>();
    m.forEach((k, v) -> copy.put(String.valueOf(k), v));
    return copy;
  }

  private Map<String, Object> parseJson(String raw) {
    try {
      return objectMapper.readValue(raw == null || raw.isBlank() ? "{}" : raw, new TypeReference<>() {});
    } catch (Exception e) {
      return new LinkedHashMap<>();
    }
  }

  private String writeJson(Object obj) {
    try {
      return objectMapper.writeValueAsString(obj);
    } catch (Exception e) {
      return "{}";
    }
  }

  private static LocalDate parseRequiredDate(Object v) {
    String s = str(v);
    if (s.isEmpty()) throw new ErpBusinessException("Valid transaction date (YYYY-MM-DD) is required.");
    try {
      return LocalDate.parse(s.substring(0, Math.min(10, s.length())));
    } catch (Exception e) {
      throw new ErpBusinessException("Invalid date format: " + s);
    }
  }

  private static BigDecimal decimalRequiredPositive(Object v) {
    BigDecimal d = decimalOrZero(v);
    if (d.compareTo(BigDecimal.ZERO) <= 0) throw new ErpBusinessException("Quantity must be greater than 0.");
    return d;
  }

  private static BigDecimal decimalOrZero(Object v) {
    if (v == null || String.valueOf(v).trim().isEmpty()) return BigDecimal.ZERO;
    try {
      return new BigDecimal(String.valueOf(v).trim()).setScale(4, RoundingMode.HALF_UP);
    } catch (Exception e) {
      return BigDecimal.ZERO;
    }
  }

  private static BigDecimal decimalNullable(Object v) {
    if (v == null || String.valueOf(v).trim().isEmpty()) return null;
    try {
      return new BigDecimal(String.valueOf(v).trim()).setScale(4, RoundingMode.HALF_UP);
    } catch (Exception e) {
      return null;
    }
  }

  private static int intOr(Object v, int def) {
    try { return v == null ? def : Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return def; }
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v).trim();
  }

  private record RateMeta(BigDecimal unitRate, String currency, BigDecimal exchangeRate, BigDecimal totalAmount, BigDecimal totalAmountNpr, Map<String, Object> meta) {}

  public static class StockBucket {
    public final ItemMasterEntity item;
    public BigDecimal openingBeforeDate = BigDecimal.ZERO;
    public BigDecimal periodIn = BigDecimal.ZERO;
    public BigDecimal periodOut = BigDecimal.ZERO;
    public BigDecimal totalIn = BigDecimal.ZERO;
    public BigDecimal totalOut = BigDecimal.ZERO;
    public BigDecimal closing = BigDecimal.ZERO;

    public StockBucket(ItemMasterEntity item) {
      this.item = item;
    }
  }
}
