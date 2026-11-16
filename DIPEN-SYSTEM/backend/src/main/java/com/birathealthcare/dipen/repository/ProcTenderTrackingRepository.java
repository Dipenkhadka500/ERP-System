package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.ProcTenderTrackingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProcTenderTrackingRepository extends JpaRepository<ProcTenderTrackingEntity, String> {
  List<ProcTenderTrackingEntity> findByTenderNoIgnoreCase(String tenderNo);
}
