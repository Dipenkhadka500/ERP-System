package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.ErpSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ErpSessionRepository extends JpaRepository<ErpSessionEntity, String> {
  Optional<ErpSessionEntity> findByTokenAndRevokedFalse(String token);
}
