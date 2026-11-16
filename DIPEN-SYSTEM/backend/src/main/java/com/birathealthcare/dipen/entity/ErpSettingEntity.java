package com.birathealthcare.dipen.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "erp_settings")
public class ErpSettingEntity {

  @Id
  @Column(name = "setting_key", length = 100)
  private String settingKey;

  @Column(name = "setting_value", nullable = false, length = 500)
  private String settingValue;

  @Column(name = "description", length = 255)
  private String description;

  @Column(name = "updated_at")
  private LocalDateTime updatedAt;

  public String getSettingKey() { return settingKey; }
  public void setSettingKey(String settingKey) { this.settingKey = settingKey; }
  public String getSettingValue() { return settingValue; }
  public void setSettingValue(String settingValue) { this.settingValue = settingValue; }
  public String getDescription() { return description; }
  public void setDescription(String description) { this.description = description; }
  public LocalDateTime getUpdatedAt() { return updatedAt; }
  public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
