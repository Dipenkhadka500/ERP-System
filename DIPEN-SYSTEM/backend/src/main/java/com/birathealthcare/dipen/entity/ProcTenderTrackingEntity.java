package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "proc_tender_tracking")
public class ProcTenderTrackingEntity {
  @Id @Column(name = "tracking_id", length = 64) private String trackingId;
  @Column(name = "tender_no", length = 64) private String tenderNo = "";
  @Column(name = "tender_name", length = 255) private String tenderName = "";
  @Column(name = "address", length = 255) private String address = "";
  @Column(name = "contact_info", length = 200) private String contactInfo = "";
  @Column(name = "last_submission_date", length = 32) private String lastSubmissionDate = "";
  @Column(name = "item_name", length = 200) private String itemName = "";
  @Column(name = "unit", length = 40) private String unit = "";
  @Column(name = "quantity", nullable = false, precision = 18, scale = 4) private BigDecimal quantity = BigDecimal.ZERO;
  @Column(name = "rate_inc_vat", nullable = false, precision = 18, scale = 4) private BigDecimal rateIncVat = BigDecimal.ZERO;
  @Column(name = "amount", nullable = false, precision = 18, scale = 2) private BigDecimal amount = BigDecimal.ZERO;
  @Column(name = "muchulka_status", nullable = false, length = 32) private String muchulkaStatus = "Pending";
  @Column(name = "muchulka_date", length = 32) private String muchulkaDate = "";
  @Column(name = "loi_status", nullable = false, length = 32) private String loiStatus = "Pending";
  @Column(name = "loi_date", length = 32) private String loiDate = "";
  @Column(name = "loa_status", nullable = false, length = 32) private String loaStatus = "Pending";
  @Column(name = "loa_date", length = 32) private String loaDate = "";
  @Column(name = "pg_status", nullable = false, length = 32) private String pgStatus = "Pending";
  @Column(name = "pg_date", length = 32) private String pgDate = "";
  @Column(name = "sample_status", nullable = false, length = 32) private String sampleStatus = "Pending";
  @Column(name = "sample_date", length = 32) private String sampleDate = "";
  @Column(name = "production_status", nullable = false, length = 40) private String productionStatus = "Not Started";
  @Column(name = "dispatch_status", nullable = false, length = 40) private String dispatchStatus = "Not Dispatched";
  @Column(name = "dispatch_date", length = 32) private String dispatchDate = "";
  @Column(name = "remarks", length = 500) private String remarks = "";
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getTrackingId() { return trackingId; }
  public void setTrackingId(String trackingId) { this.trackingId = trackingId; }
  public String getTenderNo() { return tenderNo; }
  public void setTenderNo(String tenderNo) { this.tenderNo = tenderNo; }
  public String getTenderName() { return tenderName; }
  public void setTenderName(String tenderName) { this.tenderName = tenderName; }
  public String getAddress() { return address; }
  public void setAddress(String address) { this.address = address; }
  public String getContactInfo() { return contactInfo; }
  public void setContactInfo(String contactInfo) { this.contactInfo = contactInfo; }
  public String getLastSubmissionDate() { return lastSubmissionDate; }
  public void setLastSubmissionDate(String lastSubmissionDate) { this.lastSubmissionDate = lastSubmissionDate; }
  public String getItemName() { return itemName; }
  public void setItemName(String itemName) { this.itemName = itemName; }
  public String getUnit() { return unit; }
  public void setUnit(String unit) { this.unit = unit; }
  public BigDecimal getQuantity() { return quantity; }
  public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }
  public BigDecimal getRateIncVat() { return rateIncVat; }
  public void setRateIncVat(BigDecimal rateIncVat) { this.rateIncVat = rateIncVat; }
  public BigDecimal getAmount() { return amount; }
  public void setAmount(BigDecimal amount) { this.amount = amount; }
  public String getMuchulkaStatus() { return muchulkaStatus; }
  public void setMuchulkaStatus(String muchulkaStatus) { this.muchulkaStatus = muchulkaStatus; }
  public String getMuchulkaDate() { return muchulkaDate; }
  public void setMuchulkaDate(String muchulkaDate) { this.muchulkaDate = muchulkaDate; }
  public String getLoiStatus() { return loiStatus; }
  public void setLoiStatus(String loiStatus) { this.loiStatus = loiStatus; }
  public String getLoiDate() { return loiDate; }
  public void setLoiDate(String loiDate) { this.loiDate = loiDate; }
  public String getLoaStatus() { return loaStatus; }
  public void setLoaStatus(String loaStatus) { this.loaStatus = loaStatus; }
  public String getLoaDate() { return loaDate; }
  public void setLoaDate(String loaDate) { this.loaDate = loaDate; }
  public String getPgStatus() { return pgStatus; }
  public void setPgStatus(String pgStatus) { this.pgStatus = pgStatus; }
  public String getPgDate() { return pgDate; }
  public void setPgDate(String pgDate) { this.pgDate = pgDate; }
  public String getSampleStatus() { return sampleStatus; }
  public void setSampleStatus(String sampleStatus) { this.sampleStatus = sampleStatus; }
  public String getSampleDate() { return sampleDate; }
  public void setSampleDate(String sampleDate) { this.sampleDate = sampleDate; }
  public String getProductionStatus() { return productionStatus; }
  public void setProductionStatus(String productionStatus) { this.productionStatus = productionStatus; }
  public String getDispatchStatus() { return dispatchStatus; }
  public void setDispatchStatus(String dispatchStatus) { this.dispatchStatus = dispatchStatus; }
  public String getDispatchDate() { return dispatchDate; }
  public void setDispatchDate(String dispatchDate) { this.dispatchDate = dispatchDate; }
  public String getRemarks() { return remarks; }
  public void setRemarks(String remarks) { this.remarks = remarks; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
