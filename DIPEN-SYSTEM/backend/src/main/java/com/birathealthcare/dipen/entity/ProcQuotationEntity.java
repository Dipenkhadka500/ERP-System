package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "proc_quotations")
public class ProcQuotationEntity {
  @Id @Column(name = "quotation_no", length = 64) private String quotationNo;
  @Column(name = "indent_no", length = 64) private String indentNo = "";
  @Column(name = "supplier_id", length = 64) private String supplierId = "";
  @Column(name = "supplier_name", length = 200) private String supplierName = "";
  @Column(name = "quote_date", nullable = false) private LocalDate quoteDate;
  @Column(name = "validity_date", length = 32) private String validityDate = "";
  @Column(name = "currency", nullable = false, length = 16) private String currency = "NPR";
  @Column(name = "exchange_rate", nullable = false, precision = 18, scale = 6) private BigDecimal exchangeRate = BigDecimal.ONE;
  @Column(name = "incoterms", length = 64) private String incoterms = "";
  @Column(name = "freight_charges", nullable = false, precision = 18, scale = 4) private BigDecimal freightCharges = BigDecimal.ZERO;
  @Column(name = "other_charges", nullable = false, precision = 18, scale = 4) private BigDecimal otherCharges = BigDecimal.ZERO;
  @Column(name = "subtotal", nullable = false, precision = 18, scale = 4) private BigDecimal subtotal = BigDecimal.ZERO;
  @Column(name = "total_amount", nullable = false, precision = 18, scale = 4) private BigDecimal totalAmount = BigDecimal.ZERO;
  @Column(name = "total_amount_npr", nullable = false, precision = 18, scale = 2) private BigDecimal totalAmountNpr = BigDecimal.ZERO;
  @Column(name = "status", nullable = false, length = 40) private String status = "Pending MD Approval";
  @Column(name = "md_approval", nullable = false, length = 32) private String mdApproval = "Pending";
  @Column(name = "md_approval_date", length = 64) private String mdApprovalDate = "";
  @Column(name = "md_notes", length = 500) private String mdNotes = "";
  @Column(name = "attachment_name", length = 255) private String attachmentName = "";
  @Column(name = "attachment_url", length = 500) private String attachmentUrl = "";
  @Column(name = "items_json", columnDefinition = "LONGTEXT") private String itemsJson = "[]";
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getQuotationNo() { return quotationNo; }
  public void setQuotationNo(String quotationNo) { this.quotationNo = quotationNo; }
  public String getIndentNo() { return indentNo; }
  public void setIndentNo(String indentNo) { this.indentNo = indentNo; }
  public String getSupplierId() { return supplierId; }
  public void setSupplierId(String supplierId) { this.supplierId = supplierId; }
  public String getSupplierName() { return supplierName; }
  public void setSupplierName(String supplierName) { this.supplierName = supplierName; }
  public LocalDate getQuoteDate() { return quoteDate; }
  public void setQuoteDate(LocalDate quoteDate) { this.quoteDate = quoteDate; }
  public String getValidityDate() { return validityDate; }
  public void setValidityDate(String validityDate) { this.validityDate = validityDate; }
  public String getCurrency() { return currency; }
  public void setCurrency(String currency) { this.currency = currency; }
  public BigDecimal getExchangeRate() { return exchangeRate; }
  public void setExchangeRate(BigDecimal exchangeRate) { this.exchangeRate = exchangeRate; }
  public String getIncoterms() { return incoterms; }
  public void setIncoterms(String incoterms) { this.incoterms = incoterms; }
  public BigDecimal getFreightCharges() { return freightCharges; }
  public void setFreightCharges(BigDecimal freightCharges) { this.freightCharges = freightCharges; }
  public BigDecimal getOtherCharges() { return otherCharges; }
  public void setOtherCharges(BigDecimal otherCharges) { this.otherCharges = otherCharges; }
  public BigDecimal getSubtotal() { return subtotal; }
  public void setSubtotal(BigDecimal subtotal) { this.subtotal = subtotal; }
  public BigDecimal getTotalAmount() { return totalAmount; }
  public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
  public BigDecimal getTotalAmountNpr() { return totalAmountNpr; }
  public void setTotalAmountNpr(BigDecimal totalAmountNpr) { this.totalAmountNpr = totalAmountNpr; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getMdApproval() { return mdApproval; }
  public void setMdApproval(String mdApproval) { this.mdApproval = mdApproval; }
  public String getMdApprovalDate() { return mdApprovalDate; }
  public void setMdApprovalDate(String mdApprovalDate) { this.mdApprovalDate = mdApprovalDate; }
  public String getMdNotes() { return mdNotes; }
  public void setMdNotes(String mdNotes) { this.mdNotes = mdNotes; }
  public String getAttachmentName() { return attachmentName; }
  public void setAttachmentName(String attachmentName) { this.attachmentName = attachmentName; }
  public String getAttachmentUrl() { return attachmentUrl; }
  public void setAttachmentUrl(String attachmentUrl) { this.attachmentUrl = attachmentUrl; }
  public String getItemsJson() { return itemsJson; }
  public void setItemsJson(String itemsJson) { this.itemsJson = itemsJson; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
