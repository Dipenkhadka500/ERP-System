package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "proc_suppliers")
public class ProcSupplierEntity {
  @Id @Column(name = "supplier_id", length = 64) private String supplierId;
  @Column(name = "name", nullable = false, length = 200) private String name;
  @Column(name = "pan_no", length = 64) private String panNo = "";
  @Column(name = "gst_no", length = 64) private String gstNo = "";
  @Column(name = "contact_person", length = 120) private String contactPerson = "";
  @Column(name = "phone", length = 64) private String phone = "";
  @Column(name = "email", length = 160) private String email = "";
  @Column(name = "country", length = 80) private String country = "";
  @Column(name = "address", length = 500) private String address = "";
  @Column(name = "payment_terms", length = 120) private String paymentTerms = "";
  @Column(name = "currency", nullable = false, length = 16) private String currency = "NPR";
  @Column(name = "lead_time_days", nullable = false) private int leadTimeDays = 0;
  @Column(name = "rating", length = 32) private String rating = "";
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getSupplierId() { return supplierId; }
  public void setSupplierId(String supplierId) { this.supplierId = supplierId; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; }
  public String getPanNo() { return panNo; }
  public void setPanNo(String panNo) { this.panNo = panNo; }
  public String getGstNo() { return gstNo; }
  public void setGstNo(String gstNo) { this.gstNo = gstNo; }
  public String getContactPerson() { return contactPerson; }
  public void setContactPerson(String contactPerson) { this.contactPerson = contactPerson; }
  public String getPhone() { return phone; }
  public void setPhone(String phone) { this.phone = phone; }
  public String getEmail() { return email; }
  public void setEmail(String email) { this.email = email; }
  public String getCountry() { return country; }
  public void setCountry(String country) { this.country = country; }
  public String getAddress() { return address; }
  public void setAddress(String address) { this.address = address; }
  public String getPaymentTerms() { return paymentTerms; }
  public void setPaymentTerms(String paymentTerms) { this.paymentTerms = paymentTerms; }
  public String getCurrency() { return currency; }
  public void setCurrency(String currency) { this.currency = currency; }
  public int getLeadTimeDays() { return leadTimeDays; }
  public void setLeadTimeDays(int leadTimeDays) { this.leadTimeDays = leadTimeDays; }
  public String getRating() { return rating; }
  public void setRating(String rating) { this.rating = rating; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
