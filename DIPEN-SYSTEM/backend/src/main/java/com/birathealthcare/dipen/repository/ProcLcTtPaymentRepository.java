package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.ProcLcTtPaymentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProcLcTtPaymentRepository extends JpaRepository<ProcLcTtPaymentEntity, String> {
  List<ProcLcTtPaymentEntity> findByLcOpeningDateOrMaturityDate(String lcOpeningDate, String maturityDate);
}
