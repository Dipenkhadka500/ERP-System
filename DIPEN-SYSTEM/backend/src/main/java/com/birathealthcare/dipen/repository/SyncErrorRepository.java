package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.SyncErrorEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SyncErrorRepository extends JpaRepository<SyncErrorEntity, String> {
  List<SyncErrorEntity> findByStatusOrderByErrorTimestampDesc(String status);
  long countByStatus(String status);
}
