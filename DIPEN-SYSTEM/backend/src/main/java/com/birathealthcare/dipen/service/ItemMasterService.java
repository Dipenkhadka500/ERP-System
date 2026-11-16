package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.ItemMasterEntity;
import com.birathealthcare.dipen.exception.ErpBusinessException;
import com.birathealthcare.dipen.repository.ItemMasterRepository;
import com.birathealthcare.dipen.repository.StockLedgerRepository;
import com.birathealthcare.dipen.security.ErpPrincipal;
import com.birathealthcare.dipen.security.PermissionChecker;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

@Service
public class ItemMasterService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");

  public static final List<String> FIXED_CATEGORIES = List.of(
      "Raw Material", "Packing Material", "Finished Goods", "WIP", "Stores & Spares", "Others"
  );

  private static final Map<String, Integer> CATEGORY_CODE_STARTS = Map.of(
      "WIP", 2001,
      "Finished Goods", 3001,
      "Raw Material", 4001,
      "Packing Material", 5001,
      "Stores & Spares", 6001,
      "Others", 7001
  );

  private final ItemMasterRepository itemRepo;
  private final StockLedgerRepository ledgerRepo;
  private final PermissionChecker permissionChecker;
  private final SystemVersionService versionService;
  private final AuditService auditService;

  public ItemMasterService(
      ItemMasterRepository itemRepo,
      StockLedgerRepository ledgerRepo,
      PermissionChecker permissionChecker,
      SystemVersionService versionService,
      AuditService auditService
  ) {
    this.itemRepo = itemRepo;
    this.ledgerRepo = ledgerRepo;
    this.permissionChecker = permissionChecker;
    this.versionService = versionService;
    this.auditService = auditService;
  }

  public List<Map<String, Object>> getAllItems(Map<String, Object> filters) {
    List<ItemMasterEntity> all = itemRepo.findAll();
    all.sort(Comparator.comparing(ItemMasterEntity::getItemCode));
    String category = filters != null && filters.get("category") != null ? String.valueOf(filters.get("category")).trim() : "";
    String status = filters != null && filters.get("status") != null ? String.valueOf(filters.get("status")).trim() : "";
    String brand = filters != null && filters.get("brand") != null ? String.valueOf(filters.get("brand")).trim() : "";
    String q = filters != null && filters.get("query") != null ? String.valueOf(filters.get("query")).trim().toLowerCase() : "";

    List<Map<String, Object>> out = new ArrayList<>();
    for (ItemMasterEntity it : all) {
      if (!category.isEmpty() && !it.getCategory().equalsIgnoreCase(category)) continue;
      if (!status.isEmpty() && !it.getStatus().equalsIgnoreCase(status)) continue;
      if (!brand.isEmpty() && !(it.getBrand() != null && it.getBrand().equalsIgnoreCase(brand))) continue;
      if (!q.isEmpty()) {
        String hay = (it.getItemCode() + " " + it.getItemName() + " " + it.getCategory() + " " + (it.getBrand() != null ? it.getBrand() : "") + " " + (it.getHsnCode() != null ? it.getHsnCode() : "")).toLowerCase();
        if (!hay.contains(q)) continue;
      }
      out.add(toDto(it));
    }
    return out;
  }

  public String generateItemCode(String category) {
    int start = CATEGORY_CODE_STARTS.getOrDefault(category, 7001);
    int rangeMax = start + 998;
    int maxNum = start - 1;
    Set<String> existingCodes = new HashSet<>();
    for (ItemMasterEntity it : itemRepo.findAll()) {
      existingCodes.add(it.getItemCode());
      if (it.getCategory().equals(category)) {
        try {
          int num = Integer.parseInt(it.getItemCode());
          if (num >= start && num <= rangeMax && num > maxNum) {
            maxNum = num;
          }
        } catch (NumberFormatException ignored) {}
      }
    }
    int candidate = maxNum + 1;
    while (existingCodes.contains(String.valueOf(candidate))) {
      candidate++;
    }
    return String.valueOf(candidate);
  }

  @Transactional
  public Map<String, Object> addItem(Map<String, Object> payload) {
    ErpPrincipal actor = permissionChecker.assertPermission("ITEM_MANAGE");
    String itemName = str(payload.get("itemName"));
    String category = str(payload.get("category"));
    String indexUnit = str(payload.get("indexUnit"));
    if (itemName.isEmpty()) throw new ErpBusinessException("Item Name is required.");
    if (!FIXED_CATEGORIES.contains(category)) throw new ErpBusinessException("Invalid category: " + category);
    if (indexUnit.isEmpty()) throw new ErpBusinessException("Index Unit is required.");

    String code = str(payload.get("itemCode"));
    if (code.isEmpty()) {
      code = generateItemCode(category);
    }
    if (itemRepo.existsById(code)) {
      throw new ErpBusinessException("Item Code '" + code + "' already exists.");
    }

    String today = LocalDate.now(KTM).toString();
    ItemMasterEntity entity = new ItemMasterEntity();
    entity.setItemCode(code);
    entity.setItemName(itemName);
    entity.setCategory(category);
    entity.setBrand(str(payload.get("brand")));
    entity.setHsnCode(str(payload.get("hsnCode")));
    entity.setIndexUnit(indexUnit);
    entity.setFractionOfIndexUnit(decimalOr(payload.get("fractionOfIndexUnit"), BigDecimal.ONE));
    entity.setConversionQty(decimalOr(payload.get("conversionQty"), BigDecimal.ZERO));
    entity.setConversionUnit(str(payload.get("conversionUnit")));
    entity.setReorderLevel(decimalOr(payload.get("reorderLevel"), BigDecimal.ZERO));
    entity.setStatus("Active");
    entity.setCreatedDate(today);
    entity.setUpdatedDate(today);

    itemRepo.save(entity);
    versionService.bumpVersion();
    Map<String, Object> dto = toDto(entity);
    auditService.logOperations(actor.getEmail(), actor.getRole(), "CREATE_ITEM", "Item Master", code,
        "Added " + code + " - " + itemName, null, dto);
    return dto;
  }

  @Transactional
  public Map<String, Object> updateItem(Map<String, Object> payload) {
    ErpPrincipal actor = permissionChecker.assertPermission("ITEM_MANAGE");
    String code = str(payload.get("itemCode"));
    ItemMasterEntity entity = itemRepo.findById(code)
        .orElseThrow(() -> new ErpBusinessException("Item '" + code + "' not found.", 404));

    Map<String, Object> before = toDto(entity);
    if (payload.containsKey("itemName") && !str(payload.get("itemName")).isEmpty()) {
      entity.setItemName(str(payload.get("itemName")));
    }
    if (payload.containsKey("category") && FIXED_CATEGORIES.contains(str(payload.get("category")))) {
      entity.setCategory(str(payload.get("category")));
    }
    if (payload.containsKey("brand")) entity.setBrand(str(payload.get("brand")));
    if (payload.containsKey("hsnCode")) entity.setHsnCode(str(payload.get("hsnCode")));
    if (payload.containsKey("indexUnit") && !str(payload.get("indexUnit")).isEmpty()) {
      entity.setIndexUnit(str(payload.get("indexUnit")));
    }
    if (payload.containsKey("fractionOfIndexUnit")) {
      entity.setFractionOfIndexUnit(decimalOr(payload.get("fractionOfIndexUnit"), BigDecimal.ONE));
    }
    if (payload.containsKey("conversionQty")) {
      entity.setConversionQty(decimalOr(payload.get("conversionQty"), BigDecimal.ZERO));
    }
    if (payload.containsKey("conversionUnit")) entity.setConversionUnit(str(payload.get("conversionUnit")));
    if (payload.containsKey("reorderLevel")) {
      entity.setReorderLevel(decimalOr(payload.get("reorderLevel"), BigDecimal.ZERO));
    }
    entity.setUpdatedDate(LocalDate.now(KTM).toString());

    itemRepo.save(entity);
    versionService.bumpVersion();
    Map<String, Object> after = toDto(entity);
    auditService.logOperations(actor.getEmail(), actor.getRole(), "UPDATE_ITEM", "Item Master", code,
        "Updated " + code, before, after);
    return after;
  }

  @Transactional
  public Map<String, Object> setItemStatus(String itemCode, String status) {
    ErpPrincipal actor = permissionChecker.assertPermission("ITEM_MANAGE");
    String targetStatus = "Inactive".equalsIgnoreCase(status) ? "Inactive" : "Active";
    ItemMasterEntity entity = itemRepo.findById(itemCode)
        .orElseThrow(() -> new ErpBusinessException("Item '" + itemCode + "' not found.", 404));
    String prev = entity.getStatus();
    entity.setStatus(targetStatus);
    entity.setUpdatedDate(LocalDate.now(KTM).toString());
    itemRepo.save(entity);
    versionService.bumpVersion();
    auditService.logOperations(actor.getEmail(), actor.getRole(), "SET_ITEM_STATUS", "Item Master", itemCode,
        prev + " -> " + targetStatus, Map.of("status", prev), Map.of("status", targetStatus));
    return Map.of("itemCode", itemCode, "status", targetStatus);
  }

  @Transactional
  public Map<String, Object> deleteItem(String itemCode) {
    ErpPrincipal actor = permissionChecker.assertPermission("ITEM_MANAGE");
    ItemMasterEntity entity = itemRepo.findById(itemCode)
        .orElseThrow(() -> new ErpBusinessException("Item '" + itemCode + "' not found.", 404));
    if (ledgerRepo.existsByItemCode(itemCode)) {
      throw new ErpBusinessException("Cannot delete item '" + itemCode + "' because ledger transactions exist. Mark Inactive instead.");
    }
    Map<String, Object> before = toDto(entity);
    itemRepo.delete(entity);
    versionService.bumpVersion();
    auditService.logOperations(actor.getEmail(), actor.getRole(), "DELETE_ITEM", "Item Master", itemCode,
        "Deleted unused item " + itemCode, before, null);
    return Map.of("itemCode", itemCode);
  }

  public Map<String, Object> getItemByCode(String itemCode) {
    return itemRepo.findById(itemCode).map(this::toDto).orElse(null);
  }

  public UomConversionResult convertToBaseUnit(ItemMasterEntity item, BigDecimal quantity, String uom) {
    if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) {
      throw new ErpBusinessException("Quantity must be a positive number.");
    }
    String enteredUom = (uom == null || uom.trim().isEmpty()) ? item.getIndexUnit() : uom.trim();
    if (enteredUom.equalsIgnoreCase(item.getIndexUnit())) {
      BigDecimal q = quantity.setScale(4, RoundingMode.HALF_UP);
      return new UomConversionResult(q, item.getIndexUnit(), q, item.getIndexUnit(), formatDualUom(item, q));
    }
    if (item.getConversionUnit() != null && !item.getConversionUnit().isBlank()
        && item.getConversionQty() != null && item.getConversionQty().compareTo(BigDecimal.ZERO) > 0
        && enteredUom.equalsIgnoreCase(item.getConversionUnit())) {
      BigDecimal q = quantity.setScale(4, RoundingMode.HALF_UP);
      BigDecimal base = q.multiply(item.getConversionQty()).setScale(4, RoundingMode.HALF_UP);
      return new UomConversionResult(q, item.getConversionUnit(), base, item.getIndexUnit(), formatDualUom(item, base));
    }
    throw new ErpBusinessException("Unsupported UOM '" + enteredUom + "' for item " + item.getItemCode()
        + ". Allowed: " + item.getIndexUnit() + (item.getConversionUnit() != null && !item.getConversionUnit().isBlank() ? ", " + item.getConversionUnit() : ""));
  }

  public DualUomBreakdown decomposeToDualUom(ItemMasterEntity item, BigDecimal baseQty) {
    BigDecimal q = (baseQty == null ? BigDecimal.ZERO : baseQty).setScale(4, RoundingMode.HALF_UP);
    if (item == null || item.getConversionUnit() == null || item.getConversionUnit().isBlank()
        || item.getConversionQty() == null || item.getConversionQty().compareTo(BigDecimal.ZERO) <= 0) {
      String unit = item != null ? item.getIndexUnit() : "";
      return new DualUomBreakdown(q, unit, false, BigDecimal.ZERO, "", q, q.stripTrailingZeros().toPlainString() + " " + unit);
    }
    int sign = q.signum() < 0 ? -1 : 1;
    BigDecimal absQ = q.abs();
    BigDecimal conv = item.getConversionQty();
    BigDecimal[] divRem = absQ.divideAndRemainder(conv);
    BigDecimal wholeSec = divRem[0].multiply(BigDecimal.valueOf(sign));
    BigDecimal rem = divRem[1].setScale(4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(sign));
    StringBuilder sb = new StringBuilder();
    sb.append(wholeSec.stripTrailingZeros().toPlainString()).append(" ").append(item.getConversionUnit());
    if (rem.compareTo(BigDecimal.ZERO) != 0) {
      sb.append(" ").append(rem.stripTrailingZeros().toPlainString()).append(" ").append(item.getIndexUnit());
    }
    return new DualUomBreakdown(q, item.getIndexUnit(), true, wholeSec, item.getConversionUnit(), rem, sb.toString());
  }

  public String formatDualUom(ItemMasterEntity item, BigDecimal baseQty) {
    return decomposeToDualUom(item, baseQty).display();
  }

  public Map<String, Object> toDto(ItemMasterEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("itemCode", e.getItemCode());
    m.put("itemName", e.getItemName());
    m.put("category", e.getCategory());
    m.put("brand", e.getBrand() != null ? e.getBrand() : "");
    m.put("hsnCode", e.getHsnCode() != null ? e.getHsnCode() : "");
    m.put("indexUnit", e.getIndexUnit());
    m.put("fractionOfIndexUnit", e.getFractionOfIndexUnit());
    m.put("conversionQty", e.getConversionQty());
    m.put("conversionUnit", e.getConversionUnit() != null ? e.getConversionUnit() : "");
    m.put("reorderLevel", e.getReorderLevel());
    m.put("status", e.getStatus());
    m.put("createdDate", e.getCreatedDate());
    m.put("updatedDate", e.getUpdatedDate());
    return m;
  }

  private static String str(Object v) {
    return v == null ? "" : String.valueOf(v).trim();
  }

  private static BigDecimal decimalOr(Object v, BigDecimal fallback) {
    if (v == null || String.valueOf(v).trim().isEmpty()) return fallback;
    try {
      return new BigDecimal(String.valueOf(v).trim()).setScale(4, RoundingMode.HALF_UP);
    } catch (Exception e) {
      return fallback;
    }
  }

  public record UomConversionResult(BigDecimal enteredQty, String enteredUom, BigDecimal baseQty, String indexUnit, String dualDisplay) {}
  public record DualUomBreakdown(BigDecimal baseQty, String indexUnit, boolean hasSecondary, BigDecimal secondaryQty, String secondaryUnit, BigDecimal remainderQty, String display) {}
}
