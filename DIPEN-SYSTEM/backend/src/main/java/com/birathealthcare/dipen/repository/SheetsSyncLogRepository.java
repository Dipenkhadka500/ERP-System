package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.SheetsSyncLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SheetsSyncLogRepository extends JpaRepository<SheetsSyncLogEntity, String> {
  List<SheetsSyncLogEntity> findAllByOrderByCreatedAtDesc();
}
