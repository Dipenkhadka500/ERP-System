package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "proc_shipments")
public class ProcShipmentEntity {
  @Id @Column(name = "shipment_id", length = 64) private String shipmentId;
  @Column(name = "po_no", length = 64) private String poNo = "";
  @Column(name = "supplier_name", length = 200) private String supplierName = "";
  @Column(name = "forwarder_id", length = 64) private String forwarderId = "";
  @Column(name = "forwarder_name", length = 200) private String forwarderName = "";
  @Column(name = "shipping_line", length = 160) private String shippingLine = "";
  @Column(name = "origin_type", length = 64) private String originType = "";
  @Column(name = "origin_country", length = 80) private String originCountry = "";
  @Column(name = "pol", length = 120) private String pol = "";
  @Column(name = "pod", length = 120) private String pod = "";
  @Column(name = "container_no", length = 100) private String containerNo = "";
  @Column(name = "bl_awb_no", length = 120) private String blAwbNo = "";
  @Column(name = "etd", length = 32) private String etd = "";
  @Column(name = "eta", length = 32) private String eta = "";
  @Column(name = "actual_departure", length = 32) private String actualDeparture = "";
  @Column(name = "actual_arrival", length = 32) private String actualArrival = "";
  @Column(name = "customs_status", length = 64) private String customsStatus = "";
  @Column(name = "freight_amount_npr", nullable = false, precision = 18, scale = 2) private BigDecimal freightAmountNpr = BigDecimal.ZERO;
  @Column(name = "shipment_status", length = 64) private String shipmentStatus = "";
  @Column(name = "remarks", length = 500) private String remarks = "";
  @Column(name = "record_timestamp", nullable = false, length = 64) private String recordTimestamp;

  public String getShipmentId() { return shipmentId; }
  public void setShipmentId(String shipmentId) { this.shipmentId = shipmentId; }
  public String getPoNo() { return poNo; }
  public void setPoNo(String poNo) { this.poNo = poNo; }
  public String getSupplierName() { return supplierName; }
  public void setSupplierName(String supplierName) { this.supplierName = supplierName; }
  public String getForwarderId() { return forwarderId; }
  public void setForwarderId(String forwarderId) { this.forwarderId = forwarderId; }
  public String getForwarderName() { return forwarderName; }
  public void setForwarderName(String forwarderName) { this.forwarderName = forwarderName; }
  public String getShippingLine() { return shippingLine; }
  public void setShippingLine(String shippingLine) { this.shippingLine = shippingLine; }
  public String getOriginType() { return originType; }
  public void setOriginType(String originType) { this.originType = originType; }
  public String getOriginCountry() { return originCountry; }
  public void setOriginCountry(String originCountry) { this.originCountry = originCountry; }
  public String getPol() { return pol; }
  public void setPol(String pol) { this.pol = pol; }
  public String getPod() { return pod; }
  public void setPod(String pod) { this.pod = pod; }
  public String getContainerNo() { return containerNo; }
  public void setContainerNo(String containerNo) { this.containerNo = containerNo; }
  public String getBlAwbNo() { return blAwbNo; }
  public void setBlAwbNo(String blAwbNo) { this.blAwbNo = blAwbNo; }
  public String getEtd() { return etd; }
  public void setEtd(String etd) { this.etd = etd; }
  public String getEta() { return eta; }
  public void setEta(String eta) { this.eta = eta; }
  public String getActualDeparture() { return actualDeparture; }
  public void setActualDeparture(String actualDeparture) { this.actualDeparture = actualDeparture; }
  public String getActualArrival() { return actualArrival; }
  public void setActualArrival(String actualArrival) { this.actualArrival = actualArrival; }
  public String getCustomsStatus() { return customsStatus; }
  public void setCustomsStatus(String customsStatus) { this.customsStatus = customsStatus; }
  public BigDecimal getFreightAmountNpr() { return freightAmountNpr; }
  public void setFreightAmountNpr(BigDecimal freightAmountNpr) { this.freightAmountNpr = freightAmountNpr; }
  public String getShipmentStatus() { return shipmentStatus; }
  public void setShipmentStatus(String shipmentStatus) { this.shipmentStatus = shipmentStatus; }
  public String getRemarks() { return remarks; }
  public void setRemarks(String remarks) { this.remarks = remarks; }
  public String getRecordTimestamp() { return recordTimestamp; }
  public void setRecordTimestamp(String recordTimestamp) { this.recordTimestamp = recordTimestamp; }
}
