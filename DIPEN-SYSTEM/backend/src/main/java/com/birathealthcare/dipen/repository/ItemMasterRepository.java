package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.ItemMasterEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ItemMasterRepository extends JpaRepository<ItemMasterEntity, String> {
  List<ItemMasterEntity> findByCategoryOrderByItemCodeAsc(String category);
  List<ItemMasterEntity> findByStatusOrderByItemCodeAsc(String status);
}
