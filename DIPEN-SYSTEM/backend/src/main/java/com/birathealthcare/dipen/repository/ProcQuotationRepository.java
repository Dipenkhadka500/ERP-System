package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.ProcQuotationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface ProcQuotationRepository extends JpaRepository<ProcQuotationEntity, String> {
  List<ProcQuotationEntity> findByQuoteDate(LocalDate quoteDate);
  List<ProcQuotationEntity> findByMdApprovalIgnoreCase(String mdApproval);
}
