package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "proc_exchange_rates")
public class ProcExchangeRateEntity {

  @Id
  @Column(name = "rate_date")
  private LocalDate rateDate;

  @Column(name = "usd", nullable = false, precision = 18, scale = 6)
  private BigDecimal usd = new BigDecimal("135.500000");

  @Column(name = "inr", nullable = false, precision = 18, scale = 6)
  private BigDecimal inr = new BigDecimal("1.601500");

  @Column(name = "eur", nullable = false, precision = 18, scale = 6)
  private BigDecimal eur = new BigDecimal("146.200000");

  @Column(name = "gbp", nullable = false, precision = 18, scale = 6)
  private BigDecimal gbp = new BigDecimal("172.800000");

  @Column(name = "cny", nullable = false, precision = 18, scale = 6)
  private BigDecimal cny = new BigDecimal("18.600000");

  @Column(name = "npr", nullable = false, precision = 18, scale = 6)
  private BigDecimal npr = BigDecimal.ONE;

  @Column(name = "remarks", length = 500)
  private String remarks = "";

  @Column(name = "updated_by", nullable = false, length = 160)
  private String updatedBy;

  @Column(name = "updated_at", nullable = false, length = 64)
  private String updatedAt;

  public LocalDate getRateDate() { return rateDate; }
  public void setRateDate(LocalDate rateDate) { this.rateDate = rateDate; }
  public BigDecimal getUsd() { return usd; }
  public void setUsd(BigDecimal usd) { this.usd = usd; }
  public BigDecimal getInr() { return inr; }
  public void setInr(BigDecimal inr) { this.inr = inr; }
  public BigDecimal getEur() { return eur; }
  public void setEur(BigDecimal eur) { this.eur = eur; }
  public BigDecimal getGbp() { return gbp; }
  public void setGbp(BigDecimal gbp) { this.gbp = gbp; }
  public BigDecimal getCny() { return cny; }
  public void setCny(BigDecimal cny) { this.cny = cny; }
  public BigDecimal getNpr() { return npr; }
  public void setNpr(BigDecimal npr) { this.npr = npr; }
  public String getRemarks() { return remarks; }
  public void setRemarks(String remarks) { this.remarks = remarks; }
  public String getUpdatedBy() { return updatedBy; }
  public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
  public String getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
