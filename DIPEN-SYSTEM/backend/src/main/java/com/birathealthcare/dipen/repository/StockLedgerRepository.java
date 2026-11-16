package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.StockLedgerEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface StockLedgerRepository extends JpaRepository<StockLedgerEntity, String> {
  List<StockLedgerEntity> findByStatusOrderByTxDateAscCreatedAtAsc(String status);
  List<StockLedgerEntity> findByItemCodeAndStatusOrderByTxDateAscCreatedAtAsc(String itemCode, String status);
  List<StockLedgerEntity> findByTxTypeOrderByTxDateDescCreatedAtDesc(String txType);
  List<StockLedgerEntity> findByStatusAndTxDate(String status, LocalDate txDate);
  boolean existsByItemCode(String itemCode);
}
