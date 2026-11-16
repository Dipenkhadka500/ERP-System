package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.*;
import com.birathealthcare.dipen.repository.*;
import com.birathealthcare.dipen.security.ErpPrincipal;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

@Service
public class ExchangeRateService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");

  private final ProcExchangeRateRepository rateRepo;
  private final ProcQuotationRepository quoteRepo;
  private final ProcPurchaseOrderRepository poRepo;
  private final ProcLcTtPaymentRepository lcttRepo;
  private final StockLedgerRepository ledgerRepo;
  private final PermissionChecker permissionChecker;
  private final SystemVersionService versionService;
  private final AuditService auditService;
  private final ObjectMapper objectMapper;

  public ExchangeRateService(
      ProcExchangeRateRepository rateRepo,
      ProcQuotationRepository quoteRepo,
      ProcPurchaseOrderRepository poRepo,
      ProcLcTtPaymentRepository lcttRepo,
      StockLedgerRepository ledgerRepo,
      PermissionChecker permissionChecker,
      SystemVersionService versionService,
      AuditService auditService,
      ObjectMapper objectMapper
  ) {
    this.rateRepo = rateRepo;
    this.quoteRepo = quoteRepo;
    this.poRepo = poRepo;
    this.lcttRepo = lcttRepo;
    this.ledgerRepo = ledgerRepo;
    this.permissionChecker = permissionChecker;
    this.versionService = versionService;
    this.auditService = auditService;
    this.objectMapper = objectMapper;
  }

  public Map<String, Object> resolveRatesForDate(String dateStr) {
    LocalDate target = parseDateOrToday(dateStr);
    Optional<ProcExchangeRateEntity> exact = rateRepo.findById(target);
    if (exact.isPresent()) {
      return toDto(exact.get(), target.toString(), exact.get().getRateDate().toString(), "Exact Date");
    }
    Optional<ProcExchangeRateEntity> prior = rateRepo.findFirstByRateDateLessThanEqualOrderByRateDateDesc(target);
    if (prior.isPresent()) {
      return toDto(prior.get(), target.toString(), prior.get().getRateDate().toString(), "Effective Prior Date");
    }
    Optional<ProcExchangeRateEntity> earliest = rateRepo.findFirstByOrderByRateDateAsc();
    if (earliest.isPresent()) {
      return toDto(earliest.get(), target.toString(), earliest.get().getRateDate().toString(), "Earliest Configured Date");
    }

    ProcExchangeRateEntity def = new ProcExchangeRateEntity();
    def.setRateDate(target);
    def.setUsd(new BigDecimal("135.500000"));
    def.setInr(new BigDecimal("1.601500"));
    def.setEur(new BigDecimal("146.200000"));
    def.setGbp(new BigDecimal("172.800000"));
    def.setCny(new BigDecimal("18.600000"));
    def.setNpr(BigDecimal.ONE);
    def.setRemarks("System baseline rate (Base: NPR)");
    def.setUpdatedBy("system-default");
    def.setUpdatedAt(Instant.now().toString());
    return toDto(def, target.toString(), target.toString(), "Default");
  }

  public BigDecimal getRateForCurrency(Map<String, Object> rateMap, String currency) {
    String c = currency == null ? "NPR" : currency.trim().toUpperCase();
    Object val = rateMap.get(c);
    if (val instanceof BigDecimal bd && bd.compareTo(BigDecimal.ZERO) > 0) return bd;
    if (val != null) {
      try {
        BigDecimal parsed = new BigDecimal(String.valueOf(val));
        if (parsed.compareTo(BigDecimal.ZERO) > 0) return parsed;
      } catch (Exception ignored) {}
    }
    return BigDecimal.ONE;
  }

  public List<Map<String, Object>> getExchangeRateHistory() {
    List<ProcExchangeRateEntity> rows = rateRepo.findAllByOrderByRateDateDesc();
    List<Map<String, Object>> out = new ArrayList<>();
    for (ProcExchangeRateEntity r : rows) {
      out.add(toDto(r, r.getRateDate().toString(), r.getRateDate().toString(), "Configured"));
    }
    return out;
  }

  @Transactional
  public Map<String, Object> saveExchangeRates(Map<String, Object> input) {
    ErpPrincipal actor = permissionChecker.assertPermission("PROCUREMENT_WRITE");
    LocalDate rateDate = parseDateOrToday(str(input.get("RateDate"), str(input.get("rateDate"))));
    Map<String, Object> existing = resolveRatesForDate(rateDate.toString());

    ProcExchangeRateEntity entity = rateRepo.findById(rateDate).orElseGet(ProcExchangeRateEntity::new);
    entity.setRateDate(rateDate);
    entity.setUsd(positiveDecimalOr(input.get("USD"), new BigDecimal(String.valueOf(existing.get("USD")))));
    entity.setInr(positiveDecimalOr(input.get("INR"), new BigDecimal(String.valueOf(existing.get("INR")))));
    entity.setEur(positiveDecimalOr(input.get("EUR"), new BigDecimal(String.valueOf(existing.get("EUR")))));
    entity.setGbp(positiveDecimalOr(input.get("GBP"), new BigDecimal(String.valueOf(existing.get("GBP")))));
    entity.setCny(positiveDecimalOr(input.get("CNY"), new BigDecimal(String.valueOf(existing.get("CNY")))));
    entity.setNpr(BigDecimal.ONE.setScale(6, RoundingMode.HALF_UP));
    entity.setRemarks(str(input.get("Remarks"), str(input.get("remarks"))));
    entity.setUpdatedBy(actor.getEmail());
    entity.setUpdatedAt(Instant.now().toString());
    rateRepo.save(entity);

    int updatedCount = 0;
    boolean applyExisting = Boolean.TRUE.equals(input.get("applyToExistingRecords"))
        || "true".equalsIgnoreCase(String.valueOf(input.get("applyToExistingRecords")));
    if (applyExisting) {
      Map<String, BigDecimal> map = Map.of(
          "USD", entity.getUsd(),
          "INR", entity.getInr(),
          "EUR", entity.getEur(),
          "GBP", entity.getGbp(),
          "CNY", entity.getCny(),
          "NPR", BigDecimal.ONE
      );
      String dateStr = rateDate.toString();

      for (ProcQuotationEntity q : quoteRepo.findByQuoteDate(rateDate)) {
        BigDecimal r = map.getOrDefault(q.getCurrency().toUpperCase(), BigDecimal.ONE);
        q.setExchangeRate(r);
        q.setTotalAmountNpr(q.getTotalAmount().multiply(r).setScale(2, RoundingMode.HALF_UP));
        quoteRepo.save(q);
        updatedCount++;
      }
      for (ProcPurchaseOrderEntity po : poRepo.findByOrderDate(rateDate)) {
        BigDecimal r = map.getOrDefault(po.getCurrency().toUpperCase(), BigDecimal.ONE);
        po.setExchangeRate(r);
        po.setTotalValueNpr(po.getTotalValue().multiply(r).setScale(2, RoundingMode.HALF_UP));
        poRepo.save(po);
        updatedCount++;
      }
      for (ProcLcTtPaymentEntity pay : lcttRepo.findByLcOpeningDateOrMaturityDate(dateStr, dateStr)) {
        String dVal = pay.getLcOpeningDate() != null && !pay.getLcOpeningDate().isBlank()
            ? pay.getLcOpeningDate() : pay.getMaturityDate();
        if (dateStr.equals(dVal)) {
          BigDecimal r = map.getOrDefault(pay.getCurrency().toUpperCase(), BigDecimal.ONE);
          pay.setExchangeRate(r);
          pay.setAmountNpr(pay.getAmount().multiply(r).setScale(2, RoundingMode.HALF_UP));
          lcttRepo.save(pay);
          updatedCount++;
        }
      }
      for (StockLedgerEntity tx : ledgerRepo.findByStatusAndTxDate("ACTIVE", rateDate)) {
        if (!"NPR".equalsIgnoreCase(tx.getCurrency()) && tx.getUnitRate().compareTo(BigDecimal.ZERO) > 0) {
          BigDecimal r = map.getOrDefault(tx.getCurrency().toUpperCase(), BigDecimal.ONE);
          BigDecimal total = tx.getEnteredQty().multiply(tx.getUnitRate()).setScale(4, RoundingMode.HALF_UP);
          BigDecimal totalNpr = total.multiply(r).setScale(2, RoundingMode.HALF_UP);
          tx.setExchangeRate(r);
          tx.setTotalAmount(total);
          tx.setTotalAmountNpr(totalNpr);
          try {
            Map<String, Object> meta = objectMapper.readValue(tx.getMetaJson() != null ? tx.getMetaJson() : "{}", new TypeReference<>() {});
            meta.put("exchangeRate", r);
            meta.put("totalAmount", total);
            meta.put("totalAmountNPR", totalNpr);
            tx.setMetaJson(objectMapper.writeValueAsString(meta));
          } catch (Exception ignored) {}
          ledgerRepo.save(tx);
          updatedCount++;
        }
      }
    }

    versionService.bumpVersion();
    auditService.logProcurement(actor.getEmail(), "UPDATE_EXCHANGE_RATES", "ExchangeRates", rateDate.toString(),
        Map.of("savedRate", toDto(entity, rateDate.toString(), rateDate.toString(), "Configured"), "updatedEntriesCount", updatedCount));
    auditService.logOperations(actor.getEmail(), actor.getRole(), "UPDATE_EXCHANGE_RATES", "Procurement:ExchangeRates",
        rateDate.toString(), "Saved date-wise exchange rates for " + rateDate + " (updated " + updatedCount + " records)", null, null);

    Map<String, Object> res = new LinkedHashMap<>();
    res.put("rateDate", rateDate.toString());
    res.put("savedRate", toDto(entity, rateDate.toString(), rateDate.toString(), "Configured"));
    res.put("updatedEntriesCount", updatedCount);
    res.put("exchangeRates", resolveRatesForDate(LocalDate.now(KTM).toString()));
    res.put("exchangeRateHistory", getExchangeRateHistory());
    return res;
  }

  public Map<String, Object> toDto(ProcExchangeRateEntity e, String rateDate, String matchedDate, String source) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("RateDate", rateDate);
    m.put("USD", e.getUsd());
    m.put("INR", e.getInr());
    m.put("EUR", e.getEur());
    m.put("GBP", e.getGbp());
    m.put("CNY", e.getCny());
    m.put("NPR", e.getNpr());
    m.put("Remarks", e.getRemarks() != null ? e.getRemarks() : "");
    m.put("UpdatedBy", e.getUpdatedBy() != null ? e.getUpdatedBy() : "");
    m.put("UpdatedAt", e.getUpdatedAt() != null ? e.getUpdatedAt() : "");
    m.put("matchedDate", matchedDate);
    m.put("source", source);
    return m;
  }

  public static LocalDate parseDateOrToday(String raw) {
    if (raw != null && !raw.trim().isEmpty()) {
      try {
        return LocalDate.parse(raw.trim().substring(0, Math.min(10, raw.trim().length())));
      } catch (Exception ignored) {}
    }
    return LocalDate.now(KTM);
  }

  private static String str(Object v, String fallback) {
    String s = v == null ? "" : String.valueOf(v).trim();
    return s.isEmpty() ? (fallback == null ? "" : fallback) : s;
  }

  private static BigDecimal positiveDecimalOr(Object v, BigDecimal fallback) {
    if (v == null || String.valueOf(v).trim().isEmpty()) return fallback;
    try {
      BigDecimal bd = new BigDecimal(String.valueOf(v).trim()).setScale(6, RoundingMode.HALF_UP);
      return bd.compareTo(BigDecimal.ZERO) > 0 ? bd : fallback;
    } catch (Exception e) {
      return fallback;
    }
  }
}
