package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "proc_purchase_orders")
public class ProcPurchaseOrderEntity {
  @Id @Column(name = "po_no", length = 64) private String poNo;
  @Column(name = "quotation_no", length = 64) private String quotationNo = "";
  @Column(name = "supplier_id", length = 64) private String supplierId = "";
  @Column(name = "supplier_name", length = 200) private String supplierName = "";
  @Column(name = "order_date", nullable = false) private LocalDate orderDate;
  @Column(name = "delivery_terms", length = 255) private String deliveryTerms = "";
  @Column(name = "payment_terms", length = 255) private String paymentTerms = "";
  @Column(name = "incoterms", length = 64) private String incoterms = "";
  @Column(name = "currency", nullable = false, length = 16) private String currency = "NPR";
  @Column(name = "exchange_rate", nullable = false, precision = 18, scale = 6) private BigDecimal exchangeRate = BigDecimal.ONE;
  @Column(name = "total_value", nullable = false, precision = 18, scale = 4) private BigDecimal totalValue = BigDecimal.ZERO;
  @Column(name = "total_value_npr", nullable = false, precision = 18, scale = 2) private BigDecimal totalValueNpr = BigDecimal.ZERO;
  @Column(name = "expected_delivery_date", length = 32) private String expectedDeliveryDate = "";
  @Column(name = "status", nullable = false, length = 40) private String status = "Pending";
  @Column(name = "approval_status", nullable = false, length = 32) private String approvalStatus = "Pending";
  @Column(name = "items_json", columnDefinition = "LONGTEXT") private String itemsJson = "[]";
  @Column(name = "received_status", nullable = false, length = 40) private String receivedStatus = "Pending Receipt";
  @Column(name = "received_qty", nullable = false, precision = 18, scale = 4) private BigDecimal receivedQty = BigDecimal.ZERO;
  @Column(name = "pending_qty", nullable = false, precision = 18, scale = 4) private BigDecimal pendingQty = BigDecimal.ZERO;
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getPoNo() { return poNo; }
  public void setPoNo(String poNo) { this.poNo = poNo; }
  public String getQuotationNo() { return quotationNo; }
  public void setQuotationNo(String quotationNo) { this.quotationNo = quotationNo; }
  public String getSupplierId() { return supplierId; }
  public void setSupplierId(String supplierId) { this.supplierId = supplierId; }
  public String getSupplierName() { return supplierName; }
  public void setSupplierName(String supplierName) { this.supplierName = supplierName; }
  public LocalDate getOrderDate() { return orderDate; }
  public void setOrderDate(LocalDate orderDate) { this.orderDate = orderDate; }
  public String getDeliveryTerms() { return deliveryTerms; }
  public void setDeliveryTerms(String deliveryTerms) { this.deliveryTerms = deliveryTerms; }
  public String getPaymentTerms() { return paymentTerms; }
  public void setPaymentTerms(String paymentTerms) { this.paymentTerms = paymentTerms; }
  public String getIncoterms() { return incoterms; }
  public void setIncoterms(String incoterms) { this.incoterms = incoterms; }
  public String getCurrency() { return currency; }
  public void setCurrency(String currency) { this.currency = currency; }
  public BigDecimal getExchangeRate() { return exchangeRate; }
  public void setExchangeRate(BigDecimal exchangeRate) { this.exchangeRate = exchangeRate; }
  public BigDecimal getTotalValue() { return totalValue; }
  public void setTotalValue(BigDecimal totalValue) { this.totalValue = totalValue; }
  public BigDecimal getTotalValueNpr() { return totalValueNpr; }
  public void setTotalValueNpr(BigDecimal totalValueNpr) { this.totalValueNpr = totalValueNpr; }
  public String getExpectedDeliveryDate() { return expectedDeliveryDate; }
  public void setExpectedDeliveryDate(String expectedDeliveryDate) { this.expectedDeliveryDate = expectedDeliveryDate; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getApprovalStatus() { return approvalStatus; }
  public void setApprovalStatus(String approvalStatus) { this.approvalStatus = approvalStatus; }
  public String getItemsJson() { return itemsJson; }
  public void setItemsJson(String itemsJson) { this.itemsJson = itemsJson; }
  public String getReceivedStatus() { return receivedStatus; }
  public void setReceivedStatus(String receivedStatus) { this.receivedStatus = receivedStatus; }
  public BigDecimal getReceivedQty() { return receivedQty; }
  public void setReceivedQty(BigDecimal receivedQty) { this.receivedQty = receivedQty; }
  public BigDecimal getPendingQty() { return pendingQty; }
  public void setPendingQty(BigDecimal pendingQty) { this.pendingQty = pendingQty; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
