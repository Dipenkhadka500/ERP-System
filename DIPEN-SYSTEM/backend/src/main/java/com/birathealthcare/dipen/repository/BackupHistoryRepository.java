package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.BackupHistoryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BackupHistoryRepository extends JpaRepository<BackupHistoryEntity, String> {
  List<BackupHistoryEntity> findAllByOrderByCreatedAtDesc();
}
