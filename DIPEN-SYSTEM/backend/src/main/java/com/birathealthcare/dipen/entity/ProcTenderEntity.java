package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "proc_tenders")
public class ProcTenderEntity {
  @Id @Column(name = "tender_no", length = 64) private String tenderNo;
  @Column(name = "tender_name", nullable = false, length = 255) private String tenderName;
  @Column(name = "address", length = 255) private String address = "";
  @Column(name = "contact_info", length = 200) private String contactInfo = "";
  @Column(name = "publication_date", length = 32) private String publicationDate = "";
  @Column(name = "submission_deadline", length = 32) private String submissionDeadline = "";
  @Column(name = "item_name", length = 200) private String itemName = "";
  @Column(name = "quantity", nullable = false, precision = 18, scale = 4) private BigDecimal quantity = BigDecimal.ZERO;
  @Column(name = "unit", length = 40) private String unit = "";
  @Column(name = "estimated_rate", nullable = false, precision = 18, scale = 4) private BigDecimal estimatedRate = BigDecimal.ZERO;
  @Column(name = "bid_security_amount", nullable = false, precision = 18, scale = 2) private BigDecimal bidSecurityAmount = BigDecimal.ZERO;
  @Column(name = "bid_security_status", length = 40) private String bidSecurityStatus = "";
  @Column(name = "result", nullable = false, length = 32) private String result = "Pending";
  @Column(name = "remarks", length = 500) private String remarks = "";
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getTenderNo() { return tenderNo; }
  public void setTenderNo(String tenderNo) { this.tenderNo = tenderNo; }
  public String getTenderName() { return tenderName; }
  public void setTenderName(String tenderName) { this.tenderName = tenderName; }
  public String getAddress() { return address; }
  public void setAddress(String address) { this.address = address; }
  public String getContactInfo() { return contactInfo; }
  public void setContactInfo(String contactInfo) { this.contactInfo = contactInfo; }
  public String getPublicationDate() { return publicationDate; }
  public void setPublicationDate(String publicationDate) { this.publicationDate = publicationDate; }
  public String getSubmissionDeadline() { return submissionDeadline; }
  public void setSubmissionDeadline(String submissionDeadline) { this.submissionDeadline = submissionDeadline; }
  public String getItemName() { return itemName; }
  public void setItemName(String itemName) { this.itemName = itemName; }
  public BigDecimal getQuantity() { return quantity; }
  public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }
  public String getUnit() { return unit; }
  public void setUnit(String unit) { this.unit = unit; }
  public BigDecimal getEstimatedRate() { return estimatedRate; }
  public void setEstimatedRate(BigDecimal estimatedRate) { this.estimatedRate = estimatedRate; }
  public BigDecimal getBidSecurityAmount() { return bidSecurityAmount; }
  public void setBidSecurityAmount(BigDecimal bidSecurityAmount) { this.bidSecurityAmount = bidSecurityAmount; }
  public String getBidSecurityStatus() { return bidSecurityStatus; }
  public void setBidSecurityStatus(String bidSecurityStatus) { this.bidSecurityStatus = bidSecurityStatus; }
  public String getResult() { return result; }
  public void setResult(String result) { this.result = result; }
  public String getRemarks() { return remarks; }
  public void setRemarks(String remarks) { this.remarks = remarks; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
