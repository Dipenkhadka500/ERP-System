package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.ProcPurchaseOrderEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface ProcPurchaseOrderRepository extends JpaRepository<ProcPurchaseOrderEntity, String> {
  List<ProcPurchaseOrderEntity> findByOrderDate(LocalDate orderDate);
  List<ProcPurchaseOrderEntity> findByApprovalStatusIgnoreCase(String approvalStatus);
}
