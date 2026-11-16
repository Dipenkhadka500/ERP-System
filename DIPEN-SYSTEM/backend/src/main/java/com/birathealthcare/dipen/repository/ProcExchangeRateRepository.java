package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.*;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ProcExchangeRateRepository extends JpaRepository<ProcExchangeRateEntity, LocalDate> {
  List<ProcExchangeRateEntity> findAllByOrderByRateDateDesc();
  Optional<ProcExchangeRateEntity> findFirstByRateDateLessThanEqualOrderByRateDateDesc(LocalDate rateDate);
  Optional<ProcExchangeRateEntity> findFirstByOrderByRateDateAsc();
}
