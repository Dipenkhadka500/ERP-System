package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "proc_lc_tt_payments")
public class ProcLcTtPaymentEntity {
  @Id @Column(name = "payment_id", length = 64) private String paymentId;
  @Column(name = "po_no", length = 64) private String poNo = "";
  @Column(name = "supplier_name", length = 200) private String supplierName = "";
  @Column(name = "bank_name", length = 160) private String bankName = "";
  @Column(name = "payment_type", nullable = false, length = 32) private String paymentType = "LC";
  @Column(name = "currency", nullable = false, length = 16) private String currency = "NPR";
  @Column(name = "amount", nullable = false, precision = 18, scale = 4) private BigDecimal amount = BigDecimal.ZERO;
  @Column(name = "exchange_rate", nullable = false, precision = 18, scale = 6) private BigDecimal exchangeRate = BigDecimal.ONE;
  @Column(name = "amount_npr", nullable = false, precision = 18, scale = 2) private BigDecimal amountNpr = BigDecimal.ZERO;
  @Column(name = "lc_number", length = 100) private String lcNumber = "";
  @Column(name = "lc_opening_date", length = 32) private String lcOpeningDate = "";
  @Column(name = "maturity_date", length = 32) private String maturityDate = "";
  @Column(name = "status", nullable = false, length = 32) private String status = "Pending";
  @Column(name = "payment_stage", length = 80) private String paymentStage = "";
  @Column(name = "remarks", length = 500) private String remarks = "";
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getPaymentId() { return paymentId; }
  public void setPaymentId(String paymentId) { this.paymentId = paymentId; }
  public String getPoNo() { return poNo; }
  public void setPoNo(String poNo) { this.poNo = poNo; }
  public String getSupplierName() { return supplierName; }
  public void setSupplierName(String supplierName) { this.supplierName = supplierName; }
  public String getBankName() { return bankName; }
  public void setBankName(String bankName) { this.bankName = bankName; }
  public String getPaymentType() { return paymentType; }
  public void setPaymentType(String paymentType) { this.paymentType = paymentType; }
  public String getCurrency() { return currency; }
  public void setCurrency(String currency) { this.currency = currency; }
  public BigDecimal getAmount() { return amount; }
  public void setAmount(BigDecimal amount) { this.amount = amount; }
  public BigDecimal getExchangeRate() { return exchangeRate; }
  public void setExchangeRate(BigDecimal exchangeRate) { this.exchangeRate = exchangeRate; }
  public BigDecimal getAmountNpr() { return amountNpr; }
  public void setAmountNpr(BigDecimal amountNpr) { this.amountNpr = amountNpr; }
  public String getLcNumber() { return lcNumber; }
  public void setLcNumber(String lcNumber) { this.lcNumber = lcNumber; }
  public String getLcOpeningDate() { return lcOpeningDate; }
  public void setLcOpeningDate(String lcOpeningDate) { this.lcOpeningDate = lcOpeningDate; }
  public String getMaturityDate() { return maturityDate; }
  public void setMaturityDate(String maturityDate) { this.maturityDate = maturityDate; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getPaymentStage() { return paymentStage; }
  public void setPaymentStage(String paymentStage) { this.paymentStage = paymentStage; }
  public String getRemarks() { return remarks; }
  public void setRemarks(String remarks) { this.remarks = remarks; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
