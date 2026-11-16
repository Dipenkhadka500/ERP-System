package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "proc_indents")
public class ProcIndentEntity {
  @Id @Column(name = "indent_no", length = 64) private String indentNo;
  @Column(name = "indent_date", nullable = false) private LocalDate indentDate;
  @Column(name = "department", length = 120) private String department = "";
  @Column(name = "requester", length = 120) private String requester = "";
  @Column(name = "item_code", length = 32) private String itemCode = "";
  @Column(name = "item_name", nullable = false, length = 200) private String itemName;
  @Column(name = "required_qty", nullable = false, precision = 18, scale = 4) private BigDecimal requiredQty = BigDecimal.ZERO;
  @Column(name = "unit", length = 40) private String unit = "";
  @Column(name = "required_delivery_date", length = 32) private String requiredDeliveryDate = "";
  @Column(name = "priority", nullable = false, length = 32) private String priority = "Normal";
  @Column(name = "status", nullable = false, length = 32) private String status = "Pending";
  @Column(name = "approved_by", length = 160) private String approvedBy = "";
  @Column(name = "approval_date", length = 64) private String approvalDate = "";
  @Column(name = "remarks", length = 500) private String remarks = "";
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getIndentNo() { return indentNo; }
  public void setIndentNo(String indentNo) { this.indentNo = indentNo; }
  public LocalDate getIndentDate() { return indentDate; }
  public void setIndentDate(LocalDate indentDate) { this.indentDate = indentDate; }
  public String getDepartment() { return department; }
  public void setDepartment(String department) { this.department = department; }
  public String getRequester() { return requester; }
  public void setRequester(String requester) { this.requester = requester; }
  public String getItemCode() { return itemCode; }
  public void setItemCode(String itemCode) { this.itemCode = itemCode; }
  public String getItemName() { return itemName; }
  public void setItemName(String itemName) { this.itemName = itemName; }
  public BigDecimal getRequiredQty() { return requiredQty; }
  public void setRequiredQty(BigDecimal requiredQty) { this.requiredQty = requiredQty; }
  public String getUnit() { return unit; }
  public void setUnit(String unit) { this.unit = unit; }
  public String getRequiredDeliveryDate() { return requiredDeliveryDate; }
  public void setRequiredDeliveryDate(String requiredDeliveryDate) { this.requiredDeliveryDate = requiredDeliveryDate; }
  public String getPriority() { return priority; }
  public void setPriority(String priority) { this.priority = priority; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getApprovedBy() { return approvedBy; }
  public void setApprovedBy(String approvedBy) { this.approvedBy = approvedBy; }
  public String getApprovalDate() { return approvalDate; }
  public void setApprovalDate(String approvalDate) { this.approvalDate = approvalDate; }
  public String getRemarks() { return remarks; }
  public void setRemarks(String remarks) { this.remarks = remarks; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
