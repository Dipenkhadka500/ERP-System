package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.ProcAuditLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProcAuditLogRepository extends JpaRepository<ProcAuditLogEntity, String> {
  List<ProcAuditLogEntity> findAllByOrderByLogTimestampDesc();
}
