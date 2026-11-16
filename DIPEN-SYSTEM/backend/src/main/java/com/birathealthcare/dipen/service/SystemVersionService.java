package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.ErpSettingEntity;
import com.birathealthcare.dipen.repository.ErpSettingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class SystemVersionService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");
  private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private final ErpSettingRepository settingRepository;

  public SystemVersionService(ErpSettingRepository settingRepository) {
    this.settingRepository = settingRepository;
  }

  public long getCurrentVersion() {
    return settingRepository.findById("ERP_DATA_VERSION")
        .map(s -> {
          try { return Long.parseLong(s.getSettingValue().trim()); } catch (Exception e) { return 1L; }
        })
        .orElse(1L);
  }

  @Transactional
  public long bumpVersion() {
    long next = getCurrentVersion() + 1;
    saveSetting("ERP_DATA_VERSION", String.valueOf(next), "Monotonic data version counter");
    saveSetting("ERP_LAST_SYNC_AT", LocalDateTime.now(KTM).format(DT_FMT), "Timestamp of last data mutation or sync");
    return next;
  }

  public Map<String, String> getAllSettingsMap() {
    Map<String, String> map = new LinkedHashMap<>();
    for (ErpSettingEntity e : settingRepository.findAll()) {
      map.put(e.getSettingKey(), e.getSettingValue());
    }
    return map;
  }

  @Transactional
  public void saveSetting(String key, String value, String description) {
    ErpSettingEntity entity = settingRepository.findById(key).orElseGet(ErpSettingEntity::new);
    entity.setSettingKey(key);
    entity.setSettingValue(value);
    if (description != null && (entity.getDescription() == null || entity.getDescription().isBlank())) {
      entity.setDescription(description);
    }
    entity.setUpdatedAt(LocalDateTime.now(KTM));
    settingRepository.save(entity);
  }
}
