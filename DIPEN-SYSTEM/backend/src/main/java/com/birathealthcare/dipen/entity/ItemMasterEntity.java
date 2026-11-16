package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

@Entity
@Table(name = "item_master")
public class ItemMasterEntity {

  @Id
  @Column(name = "item_code", length = 32)
  private String itemCode;

  @Column(name = "item_name", nullable = false, length = 200)
  private String itemName;

  @Column(name = "category", nullable = false, length = 64)
  private String category;

  @Column(name = "brand", length = 120)
  private String brand = "";

  @Column(name = "hsn_code", length = 64)
  private String hsnCode = "";

  @Column(name = "index_unit", nullable = false, length = 40)
  private String indexUnit;

  @Column(name = "fraction_of_index_unit", nullable = false, precision = 18, scale = 4)
  private BigDecimal fractionOfIndexUnit = BigDecimal.ONE;

  @Column(name = "conversion_qty", nullable = false, precision = 18, scale = 4)
  private BigDecimal conversionQty = BigDecimal.ZERO;

  @Column(name = "conversion_unit", length = 40)
  private String conversionUnit = "";

  @Column(name = "reorder_level", nullable = false, precision = 18, scale = 4)
  private BigDecimal reorderLevel = BigDecimal.ZERO;

  @Column(name = "status", nullable = false, length = 32)
  private String status = "Active";

  @Column(name = "created_date", nullable = false, length = 32)
  private String createdDate;

  @Column(name = "updated_date", nullable = false, length = 32)
  private String updatedDate;

  public String getItemCode() { return itemCode; }
  public void setItemCode(String itemCode) { this.itemCode = itemCode; }
  public String getItemName() { return itemName; }
  public void setItemName(String itemName) { this.itemName = itemName; }
  public String getCategory() { return category; }
  public void setCategory(String category) { this.category = category; }
  public String getBrand() { return brand; }
  public void setBrand(String brand) { this.brand = brand; }
  public String getHsnCode() { return hsnCode; }
  public void setHsnCode(String hsnCode) { this.hsnCode = hsnCode; }
  public String getIndexUnit() { return indexUnit; }
  public void setIndexUnit(String indexUnit) { this.indexUnit = indexUnit; }
  public BigDecimal getFractionOfIndexUnit() { return fractionOfIndexUnit; }
  public void setFractionOfIndexUnit(BigDecimal fractionOfIndexUnit) { this.fractionOfIndexUnit = fractionOfIndexUnit; }
  public BigDecimal getConversionQty() { return conversionQty; }
  public void setConversionQty(BigDecimal conversionQty) { this.conversionQty = conversionQty; }
  public String getConversionUnit() { return conversionUnit; }
  public void setConversionUnit(String conversionUnit) { this.conversionUnit = conversionUnit; }
  public BigDecimal getReorderLevel() { return reorderLevel; }
  public void setReorderLevel(BigDecimal reorderLevel) { this.reorderLevel = reorderLevel; }
  public String getStatus() { return status; }
  public void setStatus(String status) { this.status = status; }
  public String getCreatedDate() { return createdDate; }
  public void setCreatedDate(String createdDate) { this.createdDate = createdDate; }
  public String getUpdatedDate() { return updatedDate; }
  public void setUpdatedDate(String updatedDate) { this.updatedDate = updatedDate; }
}
