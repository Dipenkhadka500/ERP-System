package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.OperationsAuditLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OperationsAuditLogRepository extends JpaRepository<OperationsAuditLogEntity, String> {
  List<OperationsAuditLogEntity> findAllByOrderByLogTimestampDesc();
}
