package com.birathealthcare.dipen.service;

import com.birathealthcare.dipen.entity.OperationsAuditLogEntity;
import com.birathealthcare.dipen.entity.ProcAuditLogEntity;
import com.birathealthcare.dipen.repository.OperationsAuditLogRepository;
import com.birathealthcare.dipen.repository.ProcAuditLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Service
public class AuditService {

  private static final ZoneId KTM = ZoneId.of("Asia/Kathmandu");
  private static final DateTimeFormatter DT_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  private final OperationsAuditLogRepository opsRepo;
  private final ProcAuditLogRepository procRepo;
  private final ObjectMapper objectMapper;

  public AuditService(OperationsAuditLogRepository opsRepo, ProcAuditLogRepository procRepo, ObjectMapper objectMapper) {
    this.opsRepo = opsRepo;
    this.procRepo = procRepo;
    this.objectMapper = objectMapper;
  }

  public void logOperations(String userEmail, String role, String action, String module, String targetId, String summary, Object beforeObj, Object afterObj) {
    OperationsAuditLogEntity e = new OperationsAuditLogEntity();
    e.setAuditId("AUD-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase());
    e.setLogTimestamp(LocalDateTime.now(KTM).format(DT_FMT));
    e.setUserEmail(userEmail != null ? userEmail : "system");
    e.setUserRole(role != null ? role : "System");
    e.setAction(action);
    e.setModuleName(module);
    e.setTargetId(targetId != null ? targetId : "");
    e.setSummary(summary != null ? summary : "");
    try {
      e.setBeforeJson(beforeObj != null ? objectMapper.writeValueAsString(beforeObj) : "");
      e.setAfterJson(afterObj != null ? objectMapper.writeValueAsString(afterObj) : "");
    } catch (Exception ex) {
      e.setBeforeJson("");
      e.setAfterJson("");
    }
    opsRepo.save(e);
  }

  public void logProcurement(String userEmail, String action, String module, String recordId, Object detailsObj) {
    ProcAuditLogEntity e = new ProcAuditLogEntity();
    e.setLogId("LOG-" + UUID.randomUUID().toString().substring(0, 10).toUpperCase());
    e.setLogTimestamp(Instant.now().toString());
    e.setUserEmail(userEmail != null ? userEmail : "system");
    e.setAction(action);
    e.setModuleName(module);
    e.setRecordId(recordId != null ? recordId : "");
    try {
      String json = detailsObj instanceof String s ? s : objectMapper.writeValueAsString(detailsObj);
      e.setDetails(json.length() > 1500 ? json.substring(0, 1500) : json);
    } catch (Exception ex) {
      e.setDetails(String.valueOf(detailsObj));
    }
    procRepo.save(e);
  }
}
