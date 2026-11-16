package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "proc_freight_forwarders")
public class ProcFreightForwarderEntity {
  @Id @Column(name = "forwarder_id", length = 64) private String forwarderId;
  @Column(name = "name", nullable = false, length = 200) private String name;
  @Column(name = "address", length = 500) private String address = "";
  @Column(name = "contact_person", length = 120) private String contactPerson = "";
  @Column(name = "phone", length = 64) private String phone = "";
  @Column(name = "email", length = 160) private String email = "";
  @Column(name = "rating", length = 32) private String rating = "";
  @Column(name = "remarks", length = 500) private String remarks = "";
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getForwarderId() { return forwarderId; }
  public void setForwarderId(String forwarderId) { this.forwarderId = forwarderId; }
  public String getName() { return name; }
  public void setName(String name) { this.name = name; }
  public String getAddress() { return address; }
  public void setAddress(String address) { this.address = address; }
  public String getContactPerson() { return contactPerson; }
  public void setContactPerson(String contactPerson) { this.contactPerson = contactPerson; }
  public String getPhone() { return phone; }
  public void setPhone(String phone) { this.phone = phone; }
  public String getEmail() { return email; }
  public void setEmail(String email) { this.email = email; }
  public String getRating() { return rating; }
  public void setRating(String rating) { this.rating = rating; }
  public String getRemarks() { return remarks; }
  public void setRemarks(String remarks) { this.remarks = remarks; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
