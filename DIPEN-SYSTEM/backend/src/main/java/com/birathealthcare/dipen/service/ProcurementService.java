package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.*;
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
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.TextStyle;
import java.util.*;

@Service
public class ProcurementService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");

  private final ProcIndentRepository indentRepo;
  private final ProcSupplierRepository supplierRepo;
  private final ProcFreightForwarderRepository forwarderRepo;
  private final ProcQuotationRepository quoteRepo;
  private final ProcPurchaseOrderRepository poRepo;
  private final ProcLcTtPaymentRepository lcttRepo;
  private final ProcShipmentRepository shipmentRepo;
  private final ProcTenderRepository tenderRepo;
  private final ProcTenderTrackingRepository trackingRepo;
  private final ProcAuditLogRepository procAuditRepo;
  private final ItemMasterRepository itemRepo;
  private final ExchangeRateService fxService;
  private final PermissionChecker permissionChecker;
  private final SystemVersionService versionService;
  private final AuditService auditService;
  private final ObjectMapper objectMapper;

  public ProcurementService(
      ProcIndentRepository indentRepo,
      ProcSupplierRepository supplierRepo,
      ProcFreightForwarderRepository forwarderRepo,
      ProcQuotationRepository quoteRepo,
      ProcPurchaseOrderRepository poRepo,
      ProcLcTtPaymentRepository lcttRepo,
      ProcShipmentRepository shipmentRepo,
      ProcTenderRepository tenderRepo,
      ProcTenderTrackingRepository trackingRepo,
      ProcAuditLogRepository procAuditRepo,
      ItemMasterRepository itemRepo,
      ExchangeRateService fxService,
      PermissionChecker permissionChecker,
      SystemVersionService versionService,
      AuditService auditService,
      ObjectMapper objectMapper
  ) {
    this.indentRepo = indentRepo;
    this.supplierRepo = supplierRepo;
    this.forwarderRepo = forwarderRepo;
    this.quoteRepo = quoteRepo;
    this.poRepo = poRepo;
    this.lcttRepo = lcttRepo;
    this.shipmentRepo = shipmentRepo;
    this.tenderRepo = tenderRepo;
    this.trackingRepo = trackingRepo;
    this.procAuditRepo = procAuditRepo;
    this.itemRepo = itemRepo;
    this.fxService = fxService;
    this.permissionChecker = permissionChecker;
    this.versionService = versionService;
    this.auditService = auditService;
    this.objectMapper = objectMapper;
  }

  public List<Map<String, Object>> getRecords(String sheetName, Map<String, Object> filters) {
    permissionChecker.assertPermission("PROCUREMENT_VIEW");
    if ("ExchangeRates".equals(sheetName)) {
      return fxService.getExchangeRateHistory();
    }
    List<Map<String, Object>> list = switch (sheetName) {
      case "Indents" -> indentRepo.findAll().stream().map(this::toMap).toList();
      case "Suppliers" -> supplierRepo.findAll().stream().map(this::toMap).toList();
      case "FreightForwarder" -> forwarderRepo.findAll().stream().map(this::toMap).toList();
      case "Quotations" -> quoteRepo.findAll().stream().map(this::toMap).toList();
      case "PurchaseOrders" -> poRepo.findAll().stream().map(this::toMap).toList();
      case "LCTTPayments" -> lcttRepo.findAll().stream().map(this::toMap).toList();
      case "Shipments" -> shipmentRepo.findAll().stream().map(this::toMap).toList();
      case "Tenders" -> tenderRepo.findAll().stream().map(this::toMap).toList();
      case "TenderTracking" -> trackingRepo.findAll().stream().map(this::toMap).toList();
      case "AuditLog" -> procAuditRepo.findAllByOrderByLogTimestampDesc().stream().map(this::toMap).toList();
      default -> throw new ErpBusinessException("Invalid Procurement & Tender sheet: " + sheetName);
    };
    if (filters == null || filters.isEmpty()) return list;
    return list.stream().filter(rec -> {
      for (Map.Entry<String, Object> f : filters.entrySet()) {
        if (f.getValue() == null || String.valueOf(f.getValue()).isEmpty()) continue;
        if (!String.valueOf(rec.getOrDefault(f.getKey(), "")).equalsIgnoreCase(String.valueOf(f.getValue()))) {
          return false;
        }
      }
      return true;
    }).toList();
  }

  public Map<String, Object> getLookups() {
    permissionChecker.assertPermission("PROCUREMENT_VIEW");
    List<Map<String, Object>> activeItems = itemRepo.findByStatusOrderByItemCodeAsc("Active").stream().map(it -> {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("itemCode", it.getItemCode());
      m.put("itemName", it.getItemName());
      m.put("category", it.getCategory());
      m.put("unit", it.getIndexUnit());
      return m;
    }).toList();

    List<Map<String, Object>> activePOs = poRepo.findAll().stream()
        .filter(p -> !"rejected".equalsIgnoreCase(p.getStatus()) && !"cancelled".equalsIgnoreCase(p.getStatus()))
        .map(this::toMap).toList();

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("items", activeItems);
    out.put("suppliers", supplierRepo.findAll().stream().map(this::toMap).toList());
    out.put("forwarders", forwarderRepo.findAll().stream().map(this::toMap).toList());
    out.put("indents", indentRepo.findAll().stream().map(this::toMap).toList());
    out.put("approvedQuotations", quoteRepo.findByMdApprovalIgnoreCase("Approved").stream().map(this::toMap).toList());
    out.put("activePOs", activePOs);
    out.put("tenders", tenderRepo.findAll().stream().map(this::toMap).toList());
    out.put("exchangeRates", fxService.resolveRatesForDate(LocalDate.now(KTM).toString()));
    out.put("exchangeRateHistory", fxService.getExchangeRateHistory());
    return out;
  }

  @Transactional
  public Map<String, Object> saveRecord(String sheetName, Map<String, Object> data) {
    String perm = ("Tenders".equals(sheetName) || "TenderTracking".equals(sheetName)) ? "TENDER_WRITE" : "PROCUREMENT_WRITE";
    ErpPrincipal actor = permissionChecker.assertPermission(perm);
    Map<String, Object> res = saveRecordInternal(sheetName, data != null ? data : Map.of(), actor.getEmail());
    versionService.bumpVersion();
    auditService.logOperations(actor.getEmail(), actor.getRole(),
        Boolean.TRUE.equals(res.get("updated")) ? "UPDATE_RECORD" : "CREATE_RECORD",
        "Procurement:" + sheetName, String.valueOf(res.get("id")), "Saved " + res.get("id"), null, res.get("data"));
    return res;
  }

  @Transactional
  public Map<String, Object> saveRecordInternal(String sheetName, Map<String, Object> raw, String actorEmail) {
    String now = Instant.now().toString();
    boolean updated;
    String id;
    Map<String, Object> savedDto;

    switch (sheetName) {
      case "Indents" -> {
        String pk = str(raw.get("IndentNo"));
        updated = !pk.isEmpty() && indentRepo.existsById(pk);
        ProcIndentEntity e = updated ? indentRepo.findById(pk).get() : new ProcIndentEntity();
        id = pk.isEmpty() ? generateId("IND", indentRepo.findAll().stream().map(ProcIndentEntity::getIndentNo).toList()) : pk;
        e.setIndentNo(id);
        e.setIndentDate(ExchangeRateService.parseDateOrToday(strOr(raw.get("Date"), e.getIndentDate() != null ? e.getIndentDate().toString() : null)));
        if (raw.containsKey("Department")) e.setDepartment(str(raw.get("Department")));
        if (raw.containsKey("Requester")) e.setRequester(str(raw.get("Requester")));
        if (raw.containsKey("ItemCode")) e.setItemCode(str(raw.get("ItemCode")));
        if (raw.containsKey("ItemName")) e.setItemName(str(raw.get("ItemName")));
        if (e.getItemName() == null) e.setItemName("");
        if (raw.containsKey("RequiredQty")) e.setRequiredQty(dec(raw.get("RequiredQty"), 4));
        if (raw.containsKey("Unit")) e.setUnit(str(raw.get("Unit")));
        if (raw.containsKey("RequiredDeliveryDate")) e.setRequiredDeliveryDate(str(raw.get("RequiredDeliveryDate")));
        if (raw.containsKey("Priority")) e.setPriority(strOr(raw.get("Priority"), "Normal"));
        if (raw.containsKey("Status")) e.setStatus(strOr(raw.get("Status"), "Pending"));
        if (raw.containsKey("ApprovedBy")) e.setApprovedBy(str(raw.get("ApprovedBy")));
        if (raw.containsKey("ApprovalDate")) e.setApprovalDate(str(raw.get("ApprovalDate")));
        if (raw.containsKey("Remarks")) e.setRemarks(str(raw.get("Remarks")));
        e.setRecordTimestamp(now);
        indentRepo.save(e);
        savedDto = toMap(e);
      }
      case "Suppliers" -> {
        String pk = str(raw.get("SupplierId"));
        updated = !pk.isEmpty() && supplierRepo.existsById(pk);
        ProcSupplierEntity e = updated ? supplierRepo.findById(pk).get() : new ProcSupplierEntity();
        id = pk.isEmpty() ? generateId("SUP", supplierRepo.findAll().stream().map(ProcSupplierEntity::getSupplierId).toList()) : pk;
        e.setSupplierId(id);
        if (raw.containsKey("Name")) e.setName(str(raw.get("Name")));
        if (e.getName() == null) e.setName("");
        if (raw.containsKey("PanNo")) e.setPanNo(str(raw.get("PanNo")));
        if (raw.containsKey("GstNo")) e.setGstNo(str(raw.get("GstNo")));
        if (raw.containsKey("ContactPerson")) e.setContactPerson(str(raw.get("ContactPerson")));
        if (raw.containsKey("Phone")) e.setPhone(str(raw.get("Phone")));
        if (raw.containsKey("Email")) e.setEmail(str(raw.get("Email")));
        if (raw.containsKey("Country")) e.setCountry(str(raw.get("Country")));
        if (raw.containsKey("Address")) e.setAddress(str(raw.get("Address")));
        if (raw.containsKey("PaymentTerms")) e.setPaymentTerms(str(raw.get("PaymentTerms")));
        if (raw.containsKey("Currency")) e.setCurrency(strOr(raw.get("Currency"), "NPR"));
        if (raw.containsKey("LeadTimeDays")) e.setLeadTimeDays(intOrZero(raw.get("LeadTimeDays")));
        if (raw.containsKey("Rating")) e.setRating(str(raw.get("Rating")));
        e.setRecordTimestamp(now);
        supplierRepo.save(e);
        savedDto = toMap(e);
      }
      case "FreightForwarder" -> {
        String pk = str(raw.get("ForwarderId"));
        updated = !pk.isEmpty() && forwarderRepo.existsById(pk);
        ProcFreightForwarderEntity e = updated ? forwarderRepo.findById(pk).get() : new ProcFreightForwarderEntity();
        id = pk.isEmpty() ? generateId("FF", forwarderRepo.findAll().stream().map(ProcFreightForwarderEntity::getForwarderId).toList()) : pk;
        e.setForwarderId(id);
        if (raw.containsKey("Name")) e.setName(str(raw.get("Name")));
        if (e.getName() == null) e.setName("");
        if (raw.containsKey("Address")) e.setAddress(str(raw.get("Address")));
        if (raw.containsKey("ContactPerson")) e.setContactPerson(str(raw.get("ContactPerson")));
        if (raw.containsKey("Phone")) e.setPhone(str(raw.get("Phone")));
        if (raw.containsKey("Email")) e.setEmail(str(raw.get("Email")));
        if (raw.containsKey("Rating")) e.setRating(str(raw.get("Rating")));
        if (raw.containsKey("Remarks")) e.setRemarks(str(raw.get("Remarks")));
        e.setRecordTimestamp(now);
        forwarderRepo.save(e);
        savedDto = toMap(e);
      }
      case "Quotations" -> {
        String pk = str(raw.get("QuotationNo"));
        updated = !pk.isEmpty() && quoteRepo.existsById(pk);
        ProcQuotationEntity e = updated ? quoteRepo.findById(pk).get() : new ProcQuotationEntity();
        id = pk.isEmpty() ? generateId("QT", quoteRepo.findAll().stream().map(ProcQuotationEntity::getQuotationNo).toList()) : pk;
        e.setQuotationNo(id);
        LocalDate qDate = ExchangeRateService.parseDateOrToday(strOr(raw.get("Date"), e.getQuoteDate() != null ? e.getQuoteDate().toString() : null));
        e.setQuoteDate(qDate);
        if (raw.containsKey("IndentNo")) e.setIndentNo(str(raw.get("IndentNo")));
        if (raw.containsKey("SupplierId")) e.setSupplierId(str(raw.get("SupplierId")));
        if (raw.containsKey("SupplierName")) e.setSupplierName(str(raw.get("SupplierName")));
        if (raw.containsKey("ValidityDate")) e.setValidityDate(str(raw.get("ValidityDate")));
        String curr = raw.containsKey("Currency") ? strOr(raw.get("Currency"), "NPR").toUpperCase() : strOr(e.getCurrency(), "NPR");
        e.setCurrency(curr);
        if (raw.containsKey("Incoterms")) e.setIncoterms(str(raw.get("Incoterms")));
        if (raw.containsKey("FreightCharges")) e.setFreightCharges(dec(raw.get("FreightCharges"), 4));
        if (raw.containsKey("OtherCharges")) e.setOtherCharges(dec(raw.get("OtherCharges"), 4));
        if (raw.containsKey("Subtotal")) e.setSubtotal(dec(raw.get("Subtotal"), 4));
        if (raw.containsKey("TotalAmount")) e.setTotalAmount(dec(raw.get("TotalAmount"), 4));
        BigDecimal fx = resolveEffectiveFx(qDate.toString(), curr, raw.get("ExchangeRate"));
        e.setExchangeRate(fx);
        e.setTotalAmountNpr(e.getTotalAmount().multiply(fx).setScale(2, RoundingMode.HALF_UP));
        if (raw.containsKey("Status")) e.setStatus(strOr(raw.get("Status"), "Pending MD Approval"));
        if (raw.containsKey("MDApproval")) e.setMdApproval(strOr(raw.get("MDApproval"), "Pending"));
        if (raw.containsKey("MDApprovalDate")) e.setMdApprovalDate(str(raw.get("MDApprovalDate")));
        if (raw.containsKey("MDNotes")) e.setMdNotes(str(raw.get("MDNotes")));
        if (raw.containsKey("AttachmentName")) e.setAttachmentName(str(raw.get("AttachmentName")));
        if (raw.containsKey("AttachmentUrl")) e.setAttachmentUrl(str(raw.get("AttachmentUrl")));
        if (raw.containsKey("ItemsJSON")) e.setItemsJson(strJson(raw.get("ItemsJSON"), "[]"));
        e.setRecordTimestamp(now);
        quoteRepo.save(e);
        savedDto = toMap(e);
      }
      case "PurchaseOrders" -> {
        String pk = str(raw.get("PONo"));
        updated = !pk.isEmpty() && poRepo.existsById(pk);
        ProcPurchaseOrderEntity e = updated ? poRepo.findById(pk).get() : new ProcPurchaseOrderEntity();
        id = pk.isEmpty() ? generateId("PO", poRepo.findAll().stream().map(ProcPurchaseOrderEntity::getPoNo).toList()) : pk;
        e.setPoNo(id);
        LocalDate oDate = ExchangeRateService.parseDateOrToday(strOr(raw.get("OrderDate"), e.getOrderDate() != null ? e.getOrderDate().toString() : null));
        e.setOrderDate(oDate);
        if (raw.containsKey("QuotationNo")) e.setQuotationNo(str(raw.get("QuotationNo")));
        if (raw.containsKey("SupplierId")) e.setSupplierId(str(raw.get("SupplierId")));
        if (raw.containsKey("SupplierName")) e.setSupplierName(str(raw.get("SupplierName")));
        if (raw.containsKey("DeliveryTerms")) e.setDeliveryTerms(str(raw.get("DeliveryTerms")));
        if (raw.containsKey("PaymentTerms")) e.setPaymentTerms(str(raw.get("PaymentTerms")));
        if (raw.containsKey("Incoterms")) e.setIncoterms(str(raw.get("Incoterms")));
        String curr = raw.containsKey("Currency") ? strOr(raw.get("Currency"), "NPR").toUpperCase() : strOr(e.getCurrency(), "NPR");
        e.setCurrency(curr);
        if (raw.containsKey("TotalValue")) e.setTotalValue(dec(raw.get("TotalValue"), 4));
        BigDecimal fx = resolveEffectiveFx(oDate.toString(), curr, raw.get("ExchangeRate"));
        e.setExchangeRate(fx);
        e.setTotalValueNpr(e.getTotalValue().multiply(fx).setScale(2, RoundingMode.HALF_UP));
        if (raw.containsKey("ExpectedDeliveryDate")) e.setExpectedDeliveryDate(str(raw.get("ExpectedDeliveryDate")));
        if (raw.containsKey("Status")) e.setStatus(strOr(raw.get("Status"), "Pending"));
        if (raw.containsKey("ApprovalStatus")) e.setApprovalStatus(strOr(raw.get("ApprovalStatus"), "Pending"));
        if (raw.containsKey("ItemsJSON")) e.setItemsJson(strJson(raw.get("ItemsJSON"), "[]"));
        if (raw.containsKey("ReceivedStatus")) e.setReceivedStatus(strOr(raw.get("ReceivedStatus"), "Pending Receipt"));
        if (raw.containsKey("ReceivedQty")) e.setReceivedQty(dec(raw.get("ReceivedQty"), 4));
        if (raw.containsKey("PendingQty")) e.setPendingQty(dec(raw.get("PendingQty"), 4));
        e.setRecordTimestamp(now);
        poRepo.save(e);
        savedDto = toMap(e);
      }
      case "LCTTPayments" -> {
        String pk = str(raw.get("PaymentId"));
        updated = !pk.isEmpty() && lcttRepo.existsById(pk);
        ProcLcTtPaymentEntity e = updated ? lcttRepo.findById(pk).get() : new ProcLcTtPaymentEntity();
        id = pk.isEmpty() ? generateId("PAY", lcttRepo.findAll().stream().map(ProcLcTtPaymentEntity::getPaymentId).toList()) : pk;
        e.setPaymentId(id);
        if (raw.containsKey("PONo")) e.setPoNo(str(raw.get("PONo")));
        if (raw.containsKey("SupplierName")) e.setSupplierName(str(raw.get("SupplierName")));
        if (raw.containsKey("BankName")) e.setBankName(str(raw.get("BankName")));
        if (raw.containsKey("PaymentType")) e.setPaymentType(strOr(raw.get("PaymentType"), "LC"));
        if (raw.containsKey("LCOpeningDate")) e.setLcOpeningDate(str(raw.get("LCOpeningDate")));
        if (raw.containsKey("MaturityDate")) e.setMaturityDate(str(raw.get("MaturityDate")));
        String curr = raw.containsKey("Currency") ? strOr(raw.get("Currency"), "NPR").toUpperCase() : strOr(e.getCurrency(), "NPR");
        e.setCurrency(curr);
        if (raw.containsKey("Amount")) e.setAmount(dec(raw.get("Amount"), 4));
        String dStr = !str(e.getLcOpeningDate()).isEmpty() ? e.getLcOpeningDate() : e.getMaturityDate();
        BigDecimal fx = resolveEffectiveFx(dStr, curr, raw.get("ExchangeRate"));
        e.setExchangeRate(fx);
        e.setAmountNpr(e.getAmount().multiply(fx).setScale(2, RoundingMode.HALF_UP));
        if (raw.containsKey("LCNumber")) e.setLcNumber(str(raw.get("LCNumber")));
        if (raw.containsKey("Status")) e.setStatus(strOr(raw.get("Status"), "Pending"));
        if (raw.containsKey("PaymentStage")) e.setPaymentStage(str(raw.get("PaymentStage")));
        if (raw.containsKey("Remarks")) e.setRemarks(str(raw.get("Remarks")));
        e.setRecordTimestamp(now);
        lcttRepo.save(e);
        savedDto = toMap(e);
      }
      case "Shipments" -> {
        String pk = str(raw.get("ShipmentId"));
        updated = !pk.isEmpty() && shipmentRepo.existsById(pk);
        ProcShipmentEntity e = updated ? shipmentRepo.findById(pk).get() : new ProcShipmentEntity();
        id = pk.isEmpty() ? generateId("SHP", shipmentRepo.findAll().stream().map(ProcShipmentEntity::getShipmentId).toList()) : pk;
        e.setShipmentId(id);
        if (raw.containsKey("PONo")) e.setPoNo(str(raw.get("PONo")));
        if (raw.containsKey("SupplierName")) e.setSupplierName(str(raw.get("SupplierName")));
        if (raw.containsKey("ForwarderId")) e.setForwarderId(str(raw.get("ForwarderId")));
        if (raw.containsKey("ForwarderName")) e.setForwarderName(str(raw.get("ForwarderName")));
        if (raw.containsKey("ShippingLine")) e.setShippingLine(str(raw.get("ShippingLine")));
        if (raw.containsKey("OriginType")) e.setOriginType(str(raw.get("OriginType")));
        if (raw.containsKey("OriginCountry")) e.setOriginCountry(str(raw.get("OriginCountry")));
        if (raw.containsKey("POL")) e.setPol(str(raw.get("POL")));
        if (raw.containsKey("POD")) e.setPod(str(raw.get("POD")));
        if (raw.containsKey("ContainerNo")) e.setContainerNo(str(raw.get("ContainerNo")));
        if (raw.containsKey("BLAWBNo")) e.setBlAwbNo(str(raw.get("BLAWBNo")));
        if (raw.containsKey("ETD")) e.setEtd(str(raw.get("ETD")));
        if (raw.containsKey("ETA")) e.setEta(str(raw.get("ETA")));
        if (raw.containsKey("ActualDeparture")) e.setActualDeparture(str(raw.get("ActualDeparture")));
        if (raw.containsKey("ActualArrival")) e.setActualArrival(str(raw.get("ActualArrival")));
        if (raw.containsKey("CustomsStatus")) e.setCustomsStatus(str(raw.get("CustomsStatus")));
        if (raw.containsKey("FreightAmountNPR")) e.setFreightAmountNpr(dec(raw.get("FreightAmountNPR"), 2));
        if (raw.containsKey("ShipmentStatus")) e.setShipmentStatus(str(raw.get("ShipmentStatus")));
        if (raw.containsKey("Remarks")) e.setRemarks(str(raw.get("Remarks")));
        e.setRecordTimestamp(now);
        shipmentRepo.save(e);
        savedDto = toMap(e);
      }
      case "Tenders" -> {
        String pk = str(raw.get("TenderNo"));
        updated = !pk.isEmpty() && tenderRepo.existsById(pk);
        ProcTenderEntity e = updated ? tenderRepo.findById(pk).get() : new ProcTenderEntity();
        id = pk.isEmpty() ? generateId("TND", tenderRepo.findAll().stream().map(ProcTenderEntity::getTenderNo).toList()) : pk;
        e.setTenderNo(id);
        if (raw.containsKey("TenderName")) e.setTenderName(str(raw.get("TenderName")));
        if (e.getTenderName() == null) e.setTenderName("");
        if (raw.containsKey("Address")) e.setAddress(str(raw.get("Address")));
        if (raw.containsKey("ContactInfo")) e.setContactInfo(str(raw.get("ContactInfo")));
        if (raw.containsKey("PublicationDate")) e.setPublicationDate(str(raw.get("PublicationDate")));
        if (raw.containsKey("SubmissionDeadline")) e.setSubmissionDeadline(str(raw.get("SubmissionDeadline")));
        if (raw.containsKey("ItemName")) e.setItemName(str(raw.get("ItemName")));
        if (raw.containsKey("Quantity")) e.setQuantity(dec(raw.get("Quantity"), 4));
        if (raw.containsKey("Unit")) e.setUnit(str(raw.get("Unit")));
        if (raw.containsKey("EstimatedRate")) e.setEstimatedRate(dec(raw.get("EstimatedRate"), 4));
        if (raw.containsKey("BidSecurityAmount")) e.setBidSecurityAmount(dec(raw.get("BidSecurityAmount"), 2));
        if (raw.containsKey("BidSecurityStatus")) e.setBidSecurityStatus(str(raw.get("BidSecurityStatus")));
        if (raw.containsKey("Result")) e.setResult(strOr(raw.get("Result"), "Pending"));
        if (raw.containsKey("Remarks")) e.setRemarks(str(raw.get("Remarks")));
        e.setRecordTimestamp(now);
        tenderRepo.save(e);

        if ("Win".equalsIgnoreCase(e.getResult()) && trackingRepo.findByTenderNoIgnoreCase(id).isEmpty()) {
          Map<String, Object> trk = new LinkedHashMap<>();
          trk.put("TrackingId", "TRK-" + id);
          trk.put("TenderNo", id);
          trk.put("TenderName", e.getTenderName());
          trk.put("Address", e.getAddress());
          trk.put("ContactInfo", e.getContactInfo());
          trk.put("LastSubmissionDate", e.getSubmissionDeadline());
          trk.put("ItemName", e.getItemName());
          trk.put("Unit", e.getUnit());
          trk.put("Quantity", e.getQuantity());
          trk.put("RateIncVat", e.getEstimatedRate());
          trk.put("Amount", e.getQuantity().multiply(e.getEstimatedRate()).setScale(2, RoundingMode.HALF_UP));
          trk.put("Remarks", "Auto-created from won tender " + id);
          saveRecordInternal("TenderTracking", trk, actorEmail);
        }
        savedDto = toMap(e);
      }
      case "TenderTracking" -> {
        String pk = str(raw.get("TrackingId"));
        updated = !pk.isEmpty() && trackingRepo.existsById(pk);
        ProcTenderTrackingEntity e = updated ? trackingRepo.findById(pk).get() : new ProcTenderTrackingEntity();
        id = pk.isEmpty() ? generateId("TRK", trackingRepo.findAll().stream().map(ProcTenderTrackingEntity::getTrackingId).toList()) : pk;
        e.setTrackingId(id);
        if (raw.containsKey("TenderNo")) e.setTenderNo(str(raw.get("TenderNo")));
        if (raw.containsKey("TenderName")) e.setTenderName(str(raw.get("TenderName")));
        if (raw.containsKey("Address")) e.setAddress(str(raw.get("Address")));
        if (raw.containsKey("ContactInfo")) e.setContactInfo(str(raw.get("ContactInfo")));
        if (raw.containsKey("LastSubmissionDate")) e.setLastSubmissionDate(str(raw.get("LastSubmissionDate")));
        if (raw.containsKey("ItemName")) e.setItemName(str(raw.get("ItemName")));
        if (raw.containsKey("Unit")) e.setUnit(str(raw.get("Unit")));
        if (raw.containsKey("Quantity")) e.setQuantity(dec(raw.get("Quantity"), 4));
        if (raw.containsKey("RateIncVat")) e.setRateIncVat(dec(raw.get("RateIncVat"), 4));
        if (raw.containsKey("Amount")) e.setAmount(dec(raw.get("Amount"), 2));
        else if (raw.containsKey("Quantity") || raw.containsKey("RateIncVat")) {
          e.setAmount(e.getQuantity().multiply(e.getRateIncVat()).setScale(2, RoundingMode.HALF_UP));
        }
        if (raw.containsKey("MuchulkaStatus")) e.setMuchulkaStatus(strOr(raw.get("MuchulkaStatus"), "Pending"));
        if (raw.containsKey("MuchulkaDate")) e.setMuchulkaDate(str(raw.get("MuchulkaDate")));
        if (raw.containsKey("LOIStatus")) e.setLoiStatus(strOr(raw.get("LOIStatus"), "Pending"));
        if (raw.containsKey("LOIDate")) e.setLoiDate(str(raw.get("LOIDate")));
        if (raw.containsKey("LOAStatus")) e.setLoaStatus(strOr(raw.get("LOAStatus"), "Pending"));
        if (raw.containsKey("LOADate")) e.setLoaDate(str(raw.get("LOADate")));
        if (raw.containsKey("PGStatus")) e.setPgStatus(strOr(raw.get("PGStatus"), "Pending"));
        if (raw.containsKey("PGDate")) e.setPgDate(str(raw.get("PGDate")));
        if (raw.containsKey("SampleStatus")) e.setSampleStatus(strOr(raw.get("SampleStatus"), "Pending"));
        if (raw.containsKey("SampleDate")) e.setSampleDate(str(raw.get("SampleDate")));
        if (raw.containsKey("ProductionStatus")) e.setProductionStatus(strOr(raw.get("ProductionStatus"), "Not Started"));
        if (raw.containsKey("DispatchStatus")) e.setDispatchStatus(strOr(raw.get("DispatchStatus"), "Not Dispatched"));
        if (raw.containsKey("DispatchDate")) e.setDispatchDate(str(raw.get("DispatchDate")));
        if (raw.containsKey("Remarks")) e.setRemarks(str(raw.get("Remarks")));
        e.setRecordTimestamp(now);
        trackingRepo.save(e);
        savedDto = toMap(e);
      }
      default -> throw new ErpBusinessException("Invalid Procurement & Tender sheet: " + sheetName);
    }

    auditService.logProcurement(actorEmail, updated ? "UPDATE_RECORD" : "CREATE_RECORD", sheetName, id, savedDto);
    return Map.of("id", id, "updated", updated, "data", savedDto);
  }

  @Transactional
  public Map<String, Object> deleteRecord(String sheetName, String recordId) {
    String perm = ("Tenders".equals(sheetName) || "TenderTracking".equals(sheetName)) ? "TENDER_WRITE" : "PROCUREMENT_WRITE";
    ErpPrincipal actor = permissionChecker.assertPermission(perm);
    switch (sheetName) {
      case "Indents" -> indentRepo.deleteById(recordId);
      case "Suppliers" -> supplierRepo.deleteById(recordId);
      case "FreightForwarder" -> forwarderRepo.deleteById(recordId);
      case "Quotations" -> quoteRepo.deleteById(recordId);
      case "PurchaseOrders" -> poRepo.deleteById(recordId);
      case "LCTTPayments" -> lcttRepo.deleteById(recordId);
      case "Shipments" -> shipmentRepo.deleteById(recordId);
      case "Tenders" -> tenderRepo.deleteById(recordId);
      case "TenderTracking" -> trackingRepo.deleteById(recordId);
      default -> throw new ErpBusinessException("Unsupported delete target: " + sheetName);
    }
    versionService.bumpVersion();
    auditService.logProcurement(actor.getEmail(), "DELETE_RECORD", sheetName, recordId, "Deleted " + recordId);
    return Map.of("id", recordId);
  }

  @Transactional
  public String setApproval(String moduleName, String id, String status, String remarks) {
    ErpPrincipal actor = permissionChecker.assertPermission("PROCUREMENT_APPROVE");
    String now = Instant.now().toString();
    switch (moduleName) {
      case "Quotations" -> {
        ProcQuotationEntity q = quoteRepo.findById(id)
            .orElseThrow(() -> new ErpBusinessException("Quotation " + id + " not found.", 404));
        q.setMdApproval(status);
        q.setMdApprovalDate(now);
        q.setMdNotes(remarks != null ? remarks : "");
        q.setStatus("Approved".equalsIgnoreCase(status) ? "Ready for PO" : "Rejected");
        q.setRecordTimestamp(now);
        quoteRepo.save(q);
      }
      case "PurchaseOrders" -> {
        ProcPurchaseOrderEntity po = poRepo.findById(id)
            .orElseThrow(() -> new ErpBusinessException("Purchase Order " + id + " not found.", 404));
        po.setApprovalStatus(status);
        po.setStatus("Approved".equalsIgnoreCase(status) ? "Approved" : "Rejected");
        po.setRecordTimestamp(now);
        poRepo.save(po);
      }
      case "Indents" -> {
        ProcIndentEntity ind = indentRepo.findById(id)
            .orElseThrow(() -> new ErpBusinessException("Indent " + id + " not found.", 404));
        ind.setStatus(status);
        ind.setApprovedBy(actor.getEmail());
        ind.setApprovalDate(now);
        if (remarks != null && !remarks.isBlank()) ind.setRemarks(remarks);
        ind.setRecordTimestamp(now);
        indentRepo.save(ind);
      }
      default -> throw new ErpBusinessException("Unsupported approval module: " + moduleName);
    }
    versionService.bumpVersion();
    auditService.logProcurement(actor.getEmail(), "APPROVAL_ACTION", moduleName, id, Map.of("status", status, "remarks", remarks == null ? "" : remarks));
    return moduleName + " " + id + " marked " + status + ".";
  }

  public List<Map<String, Object>> getApprovedPOsForGoodsReceipt() {
    permissionChecker.assertAnyPermission("RECEIPT_WRITE", "PROCUREMENT_VIEW", "STOCK_VIEW");
    List<ProcPurchaseOrderEntity> list = poRepo.findByApprovalStatusIgnoreCase("Approved");
    List<Map<String, Object>> out = new ArrayList<>();
    for (ProcPurchaseOrderEntity p : list) {
      if ("Cancelled".equalsIgnoreCase(p.getStatus()) || "Rejected".equalsIgnoreCase(p.getStatus())) continue;
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("poNo", p.getPoNo());
      m.put("quotationNo", p.getQuotationNo());
      m.put("supplierId", p.getSupplierId());
      m.put("supplierName", p.getSupplierName());
      m.put("orderDate", p.getOrderDate().toString());
      m.put("expectedDeliveryDate", p.getExpectedDeliveryDate());
      m.put("currency", p.getCurrency());
      m.put("exchangeRate", p.getExchangeRate());
      m.put("totalValue", p.getTotalValue());
      m.put("totalValueNPR", p.getTotalValueNpr());
      m.put("receivedStatus", p.getReceivedStatus());
      m.put("receivedQty", p.getReceivedQty());
      m.put("pendingQty", p.getPendingQty());
      try {
        m.put("items", objectMapper.readValue(p.getItemsJson() != null ? p.getItemsJson() : "[]", new TypeReference<List<Map<String, Object>>>() {}));
      } catch (Exception e) {
        m.put("items", List.of());
      }
      out.add(m);
    }
    return out;
  }

  @Transactional
  public void tryUpdatePOReceiptProgress(String poNo, BigDecimal receivedDeltaQty, String actorEmail) {
    if (poNo == null || poNo.isBlank()) return;
    Optional<ProcPurchaseOrderEntity> opt = poRepo.findById(poNo);
    if (opt.isEmpty()) return;
    ProcPurchaseOrderEntity po = opt.get();
    BigDecimal orderedQty = BigDecimal.ZERO;
    try {
      List<Map<String, Object>> items = objectMapper.readValue(po.getItemsJson() != null ? po.getItemsJson() : "[]", new TypeReference<>() {});
      for (Map<String, Object> it : items) {
        orderedQty = orderedQty.add(dec(it.get("qty"), 4));
      }
    } catch (Exception ignored) {}
    if (orderedQty.compareTo(BigDecimal.ZERO) <= 0) {
      orderedQty = po.getReceivedQty().add(po.getPendingQty());
      if (orderedQty.compareTo(BigDecimal.ZERO) <= 0) orderedQty = receivedDeltaQty;
    }
    BigDecimal newReceived = po.getReceivedQty().add(receivedDeltaQty).setScale(4, RoundingMode.HALF_UP);
    BigDecimal newPending = orderedQty.subtract(newReceived).max(BigDecimal.ZERO).setScale(4, RoundingMode.HALF_UP);
    po.setReceivedQty(newReceived);
    po.setPendingQty(newPending);
    po.setReceivedStatus(newPending.compareTo(new BigDecimal("0.0001")) <= 0 ? "Fully Received" : "Partially Received");
    po.setRecordTimestamp(Instant.now().toString());
    poRepo.save(po);
    auditService.logProcurement(actorEmail, "PO_RECEIPT_PROGRESS", "PurchaseOrders", poNo,
        Map.of("receivedQty", newReceived, "pendingQty", newPending, "receivedStatus", po.getReceivedStatus()));
  }

  public Map<String, Object> getDashboard(Map<String, Object> filterOpts) {
    permissionChecker.assertPermission("PROCUREMENT_VIEW");
    String today = LocalDate.now(KTM).toString();
    Map<String, Object> todayRates = fxService.resolveRatesForDate(today);
    List<ProcIndentEntity> indents = indentRepo.findAll();
    List<ProcQuotationEntity> quotes = quoteRepo.findAll();
    List<ProcPurchaseOrderEntity> pos = poRepo.findAll();
    List<ProcLcTtPaymentEntity> lctts = lcttRepo.findAll();
    List<ProcShipmentEntity> shipments = shipmentRepo.findAll();
    List<ProcTenderEntity> tenders = tenderRepo.findAll();
    List<ProcTenderTrackingEntity> tracks = trackingRepo.findAll();
    List<ProcAuditLogEntity> audits = procAuditRepo.findAllByOrderByLogTimestampDesc();

    BigDecimal totalPoValNpr = BigDecimal.ZERO;
    int pendingPoCount = 0;
    BigDecimal pendingPoValNpr = BigDecimal.ZERO;
    int currentYear = LocalDate.now(KTM).getYear();
    Map<String, BigDecimal> monthlyMap = new LinkedHashMap<>();
    for (int m = 1; m <= 12; m++) {
      String label = java.time.Month.of(m).getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + " " + currentYear;
      monthlyMap.put(label, BigDecimal.ZERO);
    }

    for (ProcPurchaseOrderEntity po : pos) {
      BigDecimal valNpr = po.getTotalValueNpr().compareTo(BigDecimal.ZERO) > 0
          ? po.getTotalValueNpr()
          : po.getTotalValue().multiply(fxService.getRateForCurrency(todayRates, po.getCurrency()));
      totalPoValNpr = totalPoValNpr.add(valNpr);
      if (!"completed".equalsIgnoreCase(po.getStatus()) && !"cancelled".equalsIgnoreCase(po.getStatus())
          && !"fully received".equalsIgnoreCase(po.getReceivedStatus())) {
        pendingPoCount++;
        pendingPoValNpr = pendingPoValNpr.add(valNpr);
      }
      if (po.getOrderDate() != null) {
        String key = po.getOrderDate().getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH) + " " + po.getOrderDate().getYear();
        monthlyMap.put(key, monthlyMap.getOrDefault(key, BigDecimal.ZERO).add(valNpr));
      }
    }

    BigDecimal supplierOutNpr = BigDecimal.ZERO;
    BigDecimal supplierPaidNpr = BigDecimal.ZERO;
    for (ProcLcTtPaymentEntity pay : lctts) {
      BigDecimal amtNpr = pay.getAmountNpr().compareTo(BigDecimal.ZERO) > 0
          ? pay.getAmountNpr()
          : pay.getAmount().multiply(fxService.getRateForCurrency(todayRates, pay.getCurrency()));
      if ("pending".equalsIgnoreCase(pay.getStatus()) || "in progress".equalsIgnoreCase(pay.getStatus())) {
        supplierOutNpr = supplierOutNpr.add(amtNpr);
      } else {
        supplierPaidNpr = supplierPaidNpr.add(amtNpr);
      }
    }

    BigDecimal customerOutNpr = BigDecimal.ZERO;
    for (ProcTenderTrackingEntity t : tracks) {
      String ds = t.getDispatchStatus() != null ? t.getDispatchStatus().toLowerCase() : "";
      if (ds.equals("dispatched") || ds.equals("partial") || ds.equals("batch 1 dispatched")) {
        customerOutNpr = customerOutNpr.add(t.getAmount());
      }
    }

    int shipIndia = 0, shipThird = 0, shipTotal = 0;
    for (ProcShipmentEntity s : shipments) {
      String st = (s.getShipmentStatus() != null ? s.getShipmentStatus() : "").toLowerCase();
      if (st.contains("transit") || st.contains("port") || st.equals("customs pending") || st.equals("in progress")) {
        shipTotal++;
        String orig = (s.getOriginType() != null ? s.getOriginType() : "").toLowerCase();
        String country = (s.getOriginCountry() != null ? s.getOriginCountry() : "").toLowerCase();
        if ("india".equals(orig) || country.contains("india")) shipIndia++;
        else shipThird++;
      }
    }

    long won = tenders.stream().filter(t -> "win".equalsIgnoreCase(t.getResult())).count();
    long lose = tenders.stream().filter(t -> "lose".equalsIgnoreCase(t.getResult())).count();
    long pend = tenders.stream().filter(t -> "pending".equalsIgnoreCase(t.getResult())).count();

    Map<String, Object> kpis = new LinkedHashMap<>();
    kpis.put("totalPOValueNPR", totalPoValNpr);
    kpis.put("pendingPOCount", pendingPoCount);
    kpis.put("pendingPOValueNPR", pendingPoValNpr);
    kpis.put("supplierOutstandingNPR", supplierOutNpr);
    kpis.put("supplierPaidNPR", supplierPaidNpr);
    kpis.put("customerOutstandingNPR", customerOutNpr);
    kpis.put("period", filterOpts != null && filterOpts.get("period") != null ? filterOpts.get("period") : "yearly");
    kpis.put("shipmentsInTransit", Map.of("total", shipTotal, "india", shipIndia, "thirdCountry", shipThird));
    kpis.put("totalIndents", indents.size());
    kpis.put("pendingIndents", indents.stream().filter(i -> "Pending".equalsIgnoreCase(i.getStatus())).count());
    kpis.put("pendingQuotes", quotes.stream().filter(q -> "Pending".equalsIgnoreCase(q.getMdApproval())).count());
    kpis.put("totalTenders", tenders.size());
    kpis.put("wonTenders", won);

    List<String> trendLabels = new ArrayList<>(monthlyMap.keySet());
    Map<String, Object> charts = Map.of(
        "procurementTrend", Map.of("labels", trendLabels, "data", trendLabels.stream().map(k -> monthlyMap.get(k).setScale(0, RoundingMode.HALF_UP)).toList()),
        "tenderBreakdown", Map.of("Win", won, "Pending", pend, "Lose", lose)
    );

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("kpis", kpis);
    out.put("charts", charts);
    out.put("recentPOs", pos.stream().skip(Math.max(0, pos.size() - 8)).map(this::toMap).toList());
    out.put("recentTenders", tenders.stream().skip(Math.max(0, tenders.size() - 8)).map(this::toMap).toList());
    out.put("recentAudit", audits.stream().limit(12).map(this::toMap).toList());
    out.put("exchangeRates", todayRates);
    out.put("exchangeRateHistory", fxService.getExchangeRateHistory());
    return out;
  }

  private BigDecimal resolveEffectiveFx(String dateStr, String currency, Object explicitFx) {
    BigDecimal supplied = dec(explicitFx, 6);
    if (supplied.compareTo(BigDecimal.ZERO) > 0) return supplied;
    if ("NPR".equalsIgnoreCase(currency)) return BigDecimal.ONE;
    return fxService.getRateForCurrency(fxService.resolveRatesForDate(dateStr), currency);
  }

  private String generateId(String prefix, List<String> existing) {
    Set<String> set = new HashSet<>(existing);
    int n = 1001;
    while (set.contains(prefix + "-" + n)) n++;
    return prefix + "-" + n;
  }

  // Entity -> exact GAS column-keyed Maps for 100% frontend parity
  private Map<String, Object> toMap(ProcIndentEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("IndentNo", e.getIndentNo()); m.put("Date", e.getIndentDate().toString());
    m.put("Department", e.getDepartment()); m.put("Requester", e.getRequester());
    m.put("ItemCode", e.getItemCode()); m.put("ItemName", e.getItemName());
    m.put("RequiredQty", e.getRequiredQty()); m.put("Unit", e.getUnit());
    m.put("RequiredDeliveryDate", e.getRequiredDeliveryDate()); m.put("Priority", e.getPriority());
    m.put("Status", e.getStatus()); m.put("ApprovedBy", e.getApprovedBy());
    m.put("ApprovalDate", e.getApprovalDate()); m.put("Remarks", e.getRemarks()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcSupplierEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("SupplierId", e.getSupplierId()); m.put("Name", e.getName()); m.put("PanNo", e.getPanNo());
    m.put("GstNo", e.getGstNo()); m.put("ContactPerson", e.getContactPerson()); m.put("Phone", e.getPhone());
    m.put("Email", e.getEmail()); m.put("Country", e.getCountry()); m.put("Address", e.getAddress());
    m.put("PaymentTerms", e.getPaymentTerms()); m.put("Currency", e.getCurrency());
    m.put("LeadTimeDays", e.getLeadTimeDays()); m.put("Rating", e.getRating()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcFreightForwarderEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ForwarderId", e.getForwarderId()); m.put("Name", e.getName()); m.put("Address", e.getAddress());
    m.put("ContactPerson", e.getContactPerson()); m.put("Phone", e.getPhone()); m.put("Email", e.getEmail());
    m.put("Rating", e.getRating()); m.put("Remarks", e.getRemarks()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcQuotationEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("QuotationNo", e.getQuotationNo()); m.put("IndentNo", e.getIndentNo());
    m.put("SupplierId", e.getSupplierId()); m.put("SupplierName", e.getSupplierName());
    m.put("Date", e.getQuoteDate().toString()); m.put("ValidityDate", e.getValidityDate());
    m.put("Currency", e.getCurrency()); m.put("ExchangeRate", e.getExchangeRate());
    m.put("Incoterms", e.getIncoterms()); m.put("FreightCharges", e.getFreightCharges());
    m.put("OtherCharges", e.getOtherCharges()); m.put("Subtotal", e.getSubtotal());
    m.put("TotalAmount", e.getTotalAmount()); m.put("TotalAmountNPR", e.getTotalAmountNpr());
    m.put("Status", e.getStatus()); m.put("MDApproval", e.getMdApproval());
    m.put("MDApprovalDate", e.getMdApprovalDate()); m.put("MDNotes", e.getMdNotes());
    m.put("AttachmentName", e.getAttachmentName()); m.put("AttachmentUrl", e.getAttachmentUrl());
    m.put("ItemsJSON", e.getItemsJson()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcPurchaseOrderEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("PONo", e.getPoNo()); m.put("QuotationNo", e.getQuotationNo());
    m.put("SupplierId", e.getSupplierId()); m.put("SupplierName", e.getSupplierName());
    m.put("OrderDate", e.getOrderDate().toString()); m.put("DeliveryTerms", e.getDeliveryTerms());
    m.put("PaymentTerms", e.getPaymentTerms()); m.put("Incoterms", e.getIncoterms());
    m.put("Currency", e.getCurrency()); m.put("ExchangeRate", e.getExchangeRate());
    m.put("TotalValue", e.getTotalValue()); m.put("TotalValueNPR", e.getTotalValueNpr());
    m.put("ExpectedDeliveryDate", e.getExpectedDeliveryDate()); m.put("Status", e.getStatus());
    m.put("ApprovalStatus", e.getApprovalStatus()); m.put("ItemsJSON", e.getItemsJson());
    m.put("ReceivedStatus", e.getReceivedStatus()); m.put("ReceivedQty", e.getReceivedQty());
    m.put("PendingQty", e.getPendingQty()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcLcTtPaymentEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("PaymentId", e.getPaymentId()); m.put("PONo", e.getPoNo()); m.put("SupplierName", e.getSupplierName());
    m.put("BankName", e.getBankName()); m.put("PaymentType", e.getPaymentType()); m.put("Currency", e.getCurrency());
    m.put("Amount", e.getAmount()); m.put("ExchangeRate", e.getExchangeRate()); m.put("AmountNPR", e.getAmountNpr());
    m.put("LCNumber", e.getLcNumber()); m.put("LCOpeningDate", e.getLcOpeningDate());
    m.put("MaturityDate", e.getMaturityDate()); m.put("Status", e.getStatus());
    m.put("PaymentStage", e.getPaymentStage()); m.put("Remarks", e.getRemarks()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcShipmentEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ShipmentId", e.getShipmentId()); m.put("PONo", e.getPoNo()); m.put("SupplierName", e.getSupplierName());
    m.put("ForwarderId", e.getForwarderId()); m.put("ForwarderName", e.getForwarderName());
    m.put("ShippingLine", e.getShippingLine()); m.put("OriginType", e.getOriginType());
    m.put("OriginCountry", e.getOriginCountry()); m.put("POL", e.getPol()); m.put("POD", e.getPod());
    m.put("ContainerNo", e.getContainerNo()); m.put("BLAWBNo", e.getBlAwbNo());
    m.put("ETD", e.getEtd()); m.put("ETA", e.getEta()); m.put("ActualDeparture", e.getActualDeparture());
    m.put("ActualArrival", e.getActualArrival()); m.put("CustomsStatus", e.getCustomsStatus());
    m.put("FreightAmountNPR", e.getFreightAmountNpr()); m.put("ShipmentStatus", e.getShipmentStatus());
    m.put("Remarks", e.getRemarks()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcTenderEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("TenderNo", e.getTenderNo()); m.put("TenderName", e.getTenderName()); m.put("Address", e.getAddress());
    m.put("ContactInfo", e.getContactInfo()); m.put("PublicationDate", e.getPublicationDate());
    m.put("SubmissionDeadline", e.getSubmissionDeadline()); m.put("ItemName", e.getItemName());
    m.put("Quantity", e.getQuantity()); m.put("Unit", e.getUnit()); m.put("EstimatedRate", e.getEstimatedRate());
    m.put("BidSecurityAmount", e.getBidSecurityAmount()); m.put("BidSecurityStatus", e.getBidSecurityStatus());
    m.put("Result", e.getResult()); m.put("Remarks", e.getRemarks()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcTenderTrackingEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("TrackingId", e.getTrackingId()); m.put("TenderNo", e.getTenderNo()); m.put("TenderName", e.getTenderName());
    m.put("Address", e.getAddress()); m.put("ContactInfo", e.getContactInfo());
    m.put("LastSubmissionDate", e.getLastSubmissionDate()); m.put("ItemName", e.getItemName());
    m.put("Unit", e.getUnit()); m.put("Quantity", e.getQuantity()); m.put("RateIncVat", e.getRateIncVat());
    m.put("Amount", e.getAmount()); m.put("MuchulkaStatus", e.getMuchulkaStatus()); m.put("MuchulkaDate", e.getMuchulkaDate());
    m.put("LOIStatus", e.getLoiStatus()); m.put("LOIDate", e.getLoiDate());
    m.put("LOAStatus", e.getLoaStatus()); m.put("LOADate", e.getLoaDate());
    m.put("PGStatus", e.getPgStatus()); m.put("PGDate", e.getPgDate());
    m.put("SampleStatus", e.getSampleStatus()); m.put("SampleDate", e.getSampleDate());
    m.put("ProductionStatus", e.getProductionStatus()); m.put("DispatchStatus", e.getDispatchStatus());
    m.put("DispatchDate", e.getDispatchDate()); m.put("Remarks", e.getRemarks()); m.put("Timestamp", e.getRecordTimestamp());
    return m;
  }

  private Map<String, Object> toMap(ProcAuditLogEntity e) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("LogId", e.getLogId()); m.put("Timestamp", e.getLogTimestamp()); m.put("UserEmail", e.getUserEmail());
    m.put("Action", e.getAction()); m.put("Module", e.getModuleName()); m.put("RecordId", e.getRecordId());
    m.put("Details", e.getDetails());
    return m;
  }

  private String strJson(Object v, String def) {
    if (v == null) return def;
    if (v instanceof String s) return s;
    try { return objectMapper.writeValueAsString(v); } catch (Exception e) { return def; }
  }

  private static String str(Object v) { return v == null ? "" : String.valueOf(v).trim(); }
  private static String strOr(Object v, String fallback) { String s = str(v); return s.isEmpty() ? (fallback == null ? "" : fallback) : s; }
  private static int intOrZero(Object v) { try { return v == null ? 0 : Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return 0; } }
  private static BigDecimal dec(Object v, int scale) {
    if (v == null || String.valueOf(v).trim().isEmpty()) return BigDecimal.ZERO.setScale(scale, RoundingMode.HALF_UP);
    try { return new BigDecimal(String.valueOf(v).trim()).setScale(scale, RoundingMode.HALF_UP); }
    catch (Exception e) { return BigDecimal.ZERO.setScale(scale, RoundingMode.HALF_UP); }
  }
}
