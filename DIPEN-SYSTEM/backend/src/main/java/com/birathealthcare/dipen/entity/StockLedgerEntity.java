package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "stock_ledger")
public class StockLedgerEntity {

  @Id
  @Column(name = "tx_id", length = 64)
  private String txId;

  @Column(name = "tx_type", nullable = false, length = 32)
  private String txType;

  @Column(name = "tx_date", nullable = false)
  private LocalDate txDate;

  @Column(name = "item_code", nullable = false, length = 32)
  private String itemCode;

  @Column(name = "item_name", nullable = false, length = 200)
  private String itemName;

  @Column(name = "category", nullable = false, length = 64)
  private String category;

  @Column(name = "brand", length = 120)
  private String brand = "";

  @Column(name = "entered_qty", nullable = false, precision = 18, scale = 4)
  private BigDecimal enteredQty = BigDecimal.ZERO;

  @Column(name = "entered_uom", nullable = false, length = 40)
  private String enteredUom;

  @Column(name = "base_qty", nullable = false, precision = 18, scale = 4)
  private BigDecimal baseQty = BigDecimal.ZERO;

  @Column(name = "direction", nullable = false, length = 8)
  private String direction;

  @Column(name = "source_sheet", nullable = false, length = 64)
  private String sourceSheet = "Web App";

  @Column(name = "source_row", nullable = false)
  private int sourceRow = 0;

  @Column(name = "batch_no", length = 100)
  private String batchNo = "";

  @Column(name = "ref_no", length = 120)
  private String refNo = "";

  @Column(name = "party_or_section", length = 200)
  private String partyOrSection = "";

  @Column(name = "secondary_qty", precision = 18, scale = 4)
  private BigDecimal secondaryQty;

  @Column(name = "index_qty", precision = 18, scale = 4)
  private BigDecimal indexQty;

  @Column(name = "invoice_no", length = 100)
  private String invoiceNo = "";

  @Column(name = "challan_no", length = 100)
  private String challanNo = "";

  @Column(name = "vehicle_no", length = 80)
  private String vehicleNo = "";

  @Column(name = "issued_to", length = 120)
  private String issuedTo = "";

  @Column(name = "po_no", length = 64)
  private String poNo = "";

  @Column(name = "unit_rate", nullable = false, precision = 18, scale = 4)
  private BigDecimal unitRate = BigDecimal.ZERO;

  @Column(name = "currency", nullable = false, length = 16)
  private String currency = "NPR";

  @Column(name = "exchange_rate", nullable = false, precision = 18, scale = 6)
  private BigDecimal exchangeRate = BigDecimal.ONE;

  @Column(name = "total_amount", nullable = false, precision = 18, scale = 4)
  private BigDecimal totalAmount = BigDecimal.ZERO;

  @Column(name = "total_amount_npr", nullable = false, precision = 18, scale = 2)
  private BigDecimal totalAmountNpr = BigDecimal.ZERO;

  @Column(name = "meta_json", columnDefinition = "LONGTEXT")
  private String metaJson = "{}";

  @Column(name = "remarks", length = 500)
  private String remarks = "";

  @Column(name = "created_by", nullable = false, length = 160)
  private String createdBy;

  @Column(name = "created_at", nullable = false, length = 32)
  private String createdAt;

  @Column(name = "updated_by", nullable = false, length = 160)
  private String updatedBy;

  @Column(name = "updated_at", nullable = false, length = 32)
  private String updatedAt;

  @Column(name = "status", nullable = false, length = 24)
  private String status = "ACTIVE";

  @Column(name = "sync_status", nullable = false, length = 32)
  private String syncStatus = "SYNCED";

  @Column(name = "record_hash", nullable = false, length = 64)
  private String recordHash;

  public String getTxId() { return txId; }
  public void setTxId(String txId) { this.txId = txId; }
  public String getTxType() { return txType; }
  public void setTxType(String txType) { this.txType = txType; }
  public LocalDate getTxDate() { return txDate; }
  public void setTxDate(LocalDate txDate) { this.txDate = txDate; }
  public String getItemCode() { return itemCode; }
  public void setItemCode(String itemCode) { this.itemCode = itemCode; }
  public String getItemName() { return itemName; }
  public void setItemName(String itemName) { this.itemName = itemName; }
  public String getCategory() { return category; }
  public void setCategory(String category) { this.category = category; }
  public String getBrand() { return brand; }
  public void setBrand(String brand) { this.brand = brand; }
  public BigDecimal getEnteredQty() { return enteredQty; }
  public void setEnteredQty(BigDecimal enteredQty) { this.enteredQty = enteredQty; }
  public String getEnteredUom() { return enteredUom; }
  public void setEnteredUom(String enteredUom) { this.enteredUom = enteredUom; }
  public BigDecimal getBaseQty() { return baseQty; }
  public void setBaseQty(BigDecimal baseQty) { this.baseQty = baseQty; }
  public String getDirection() { return direction; }
  public void setDirection(String direction) { this.direction = direction; }
  public String getSourceSheet() { return sourceSheet; }
  public void setSourceSheet(String sourceSheet) { this.sourceSheet = sourceSheet; }
  public int getSourceRow() { return sourceRow; }
  public void setSourceRow(int sourceRow) { this.sourceRow = sourceRow; }
  public String getBatchNo() { return batchNo; }
  public void setBatchNo(String batchNo) { this.batchNo = batchNo; }
  public String getRefNo() { return refNo; }
  public void setRefNo(String refNo) { this.refNo = refNo; }
  public String getPartyOrSection() { return partyOrSection; }
  public void setPartyOrSection(String partyOrSection) { this.partyOrSection = partyOrSection; }
  public BigDecimal getSecondaryQty() { return secondaryQty; }
  public void setSecondaryQty(BigDecimal secondaryQty) { this.secondaryQty = secondaryQty; }
  public BigDecimal getIndexQty() { return indexQty; }
  public void setIndexQty(BigDecimal indexQty) { this.indexQty = indexQty; }
  public String getInvoiceNo() { return invoiceNo; }
  public void setInvoiceNo(String invoiceNo) { this.invoiceNo = invoiceNo; }
  public String getChallanNo() { return challanNo; }
  public void setChallanNo(String challanNo) { this.challanNo = challanNo; }
  public String getVehicleNo() { return vehicleNo; }
  public void setVehicleNo(String vehicleNo) { this.vehicleNo = vehicleNo; }
  public String getIssuedTo() { return issuedTo; }
  public void setIssuedTo(String issuedTo) { this.issuedTo = issuedTo; }
  public String getPoNo() { return poNo; }
  public void setPoNo(String poNo) { this.poNo = poNo; }
  public BigDecimal getUnitRate() { return unitRate; }
  public void setUnitRate(BigDecimal unitRate) { this.unitRate = unitRate; }
  public String getCurrency() { return currency; }
  public void setCurrency(String currency) { this.currency = currency; }
  public BigDecimal getExchangeRate() { return exchangeRate; }
  public void setExchangeRate(BigDecimal exchangeRate) { this.exchangeRate = exchangeRate; }
  public BigDecimal getTotalAmount() { return totalAmount; }
  public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
  public BigDecimal getTotalAmountNpr() { return totalAmountNpr; }
  public void setTotalAmountNpr(BigDecimal totalAmountNpr) { this.totalAmountNpr = totalAmountNpr; }
  public String getMetaJson() { return metaJson; }
  public void setMetaJson(String metaJson) { this.metaJson = metaJson; }
  public String getRemarks() { return remarks; }
  public void setRemarks(String remarks) { this.remarks = remarks; }
  public String getCreatedBy() { return createdBy; }
  public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
  public String getCreatedAt() { return createdAt; }
  public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
  public String getUpdatedBy() { return updatedBy; }
  public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
  public String getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getSyncStatus() { return syncStatus; }
  public void setSyncStatus(String syncStatus) { this.syncStatus = syncStatus; }
  public String getRecordHash() { return recordHash; }
  public void setRecordHash(String recordHash) { this.recordHash = recordHash; }
}
