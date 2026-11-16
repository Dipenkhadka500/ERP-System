package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.DailyReportEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface DailyReportRepository extends JpaRepository<DailyReportEntity, String> {
  Optional<DailyReportEntity> findByReportDate(LocalDate reportDate);
}
