package com.birathealthcare.dipen;

import com.birathealthcare.dipen.entity.ItemMasterEntity;
import com.birathealthcare.dipen.entity.ProcExchangeRateEntity;
import com.birathealthcare.dipen.entity.StockLedgerEntity;
import com.birathealthcare.dipen.repository.*;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.birathealthcare.dipen.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class DipenErpParityTest {

  private ItemMasterEntity buildBoxedItem() {
    ItemMasterEntity item = new ItemMasterEntity();
    item.setItemCode("3001");
    item.setItemName("Surgical Face Mask 3-Ply");
    item.setCategory("Finished Goods");
    item.setIndexUnit("Pcs");
    item.setFractionOfIndexUnit(BigDecimal.ONE);
    item.setConversionQty(new BigDecimal("50"));
    item.setConversionUnit("Box");
    item.setReorderLevel(new BigDecimal("500"));
    item.setStatus("Active");
    return item;
  }

  @Test
  void uomConversionAndDualBreakdownMatchesGasQuotientRemainderRule() {
    ItemMasterService svc = new ItemMasterService(
        Mockito.mock(ItemMasterRepository.class),
        Mockito.mock(StockLedgerRepository.class),
        Mockito.mock(PermissionChecker.class),
        Mockito.mock(SystemVersionService.class),
        Mockito.mock(AuditService.class)
    );

    ItemMasterEntity item = buildBoxedItem();
    ItemMasterService.UomConversionResult conv = svc.convertToBaseUnit(item, new BigDecimal("3"), "Box");
    assertEquals(0, new BigDecimal("150.0000").compareTo(conv.baseQty()));
    assertEquals("3 Box", conv.dualDisplay());

    ItemMasterService.DualUomBreakdown breakdown = svc.decomposeToDualUom(item, new BigDecimal("175"));
    assertTrue(breakdown.hasSecondary());
    assertEquals(0, new BigDecimal("3").compareTo(breakdown.secondaryQty()));
    assertEquals(0, new BigDecimal("25.0000").compareTo(breakdown.remainderQty()));
    assertEquals("3 Box 25 Pcs", breakdown.display());
  }

  @Test
  void dateWiseExchangeRateFallsBackToPriorConfiguredDate() {
    ProcExchangeRateRepository rateRepo = Mockito.mock(ProcExchangeRateRepository.class);
    ProcExchangeRateEntity may10 = new ProcExchangeRateEntity();
    may10.setRateDate(LocalDate.of(2026, 5, 10));
    may10.setUsd(new BigDecimal("152.500000"));
    may10.setInr(new BigDecimal("1.601500"));
    may10.setEur(new BigDecimal("162.100000"));
    may10.setGbp(new BigDecimal("191.400000"));
    may10.setCny(new BigDecimal("21.150000"));
    may10.setNpr(BigDecimal.ONE);

    when(rateRepo.findById(LocalDate.of(2026, 5, 12))).thenReturn(Optional.empty());
    when(rateRepo.findFirstByRateDateLessThanEqualOrderByRateDateDesc(LocalDate.of(2026, 5, 12)))
        .thenReturn(Optional.of(may10));

    ExchangeRateService fx = new ExchangeRateService(
        rateRepo,
        Mockito.mock(ProcQuotationRepository.class),
        Mockito.mock(ProcPurchaseOrderRepository.class),
        Mockito.mock(ProcLcTtPaymentRepository.class),
        Mockito.mock(StockLedgerRepository.class),
        Mockito.mock(PermissionChecker.class),
        Mockito.mock(SystemVersionService.class),
        Mockito.mock(AuditService.class),
        new ObjectMapper()
    );

    var resolved = fx.resolveRatesForDate("2026-05-12");
    assertEquals("2026-05-10", resolved.get("matchedDate"));
    assertEquals("Effective Prior Date", resolved.get("source"));
    assertEquals(0, new BigDecimal("152.500000").compareTo(fx.getRateForCurrency(resolved, "USD")));
  }

  @Test
  void preservedSha256CredentialDigestsMatchFourLoginAccounts() {
    assertEquals("90934f448ff2a27fc4e790a88809f6350482b6f0139773f3376810d45113734f", AuthService.sha256Hex("dipen@123"));
    assertEquals("2c47d4785ac1402337f01a66680189c8ffabfa5f45f46166677f22e954f747da", AuthService.sha256Hex("sajal@123"));
    assertEquals("fa8a6f202c15d0bb7c4d034252599bd3045b511b3b751fc556e35c85f54c48b6", AuthService.sha256Hex("dispatch@123"));
    assertEquals("3efda0a1eb1d761099c47f4aa078556ee00037c474002a6342c5c4c48a346d91", AuthService.sha256Hex("production@123"));
  }

  @Test
  void ledgerRecordHashRemainsDeterministic() {
    StockLedgerEntity tx = new StockLedgerEntity();
    tx.setTxId("GRN-20261116-0001");
    tx.setTxType("GOODS_RECEIPT");
    tx.setTxDate(LocalDate.of(2026, 11, 16));
    tx.setItemCode("4001");
    tx.setEnteredQty(new BigDecimal("200.0000").setScale(4, RoundingMode.HALF_UP));
    tx.setEnteredUom("Kg");
    tx.setDirection("IN");
    tx.setStatus("ACTIVE");

    String h1 = InventoryTransactionService.computeRecordHash(tx);
    String h2 = InventoryTransactionService.computeRecordHash(tx);
    assertEquals(h1, h2);
    assertEquals(32, h1.length());
  }
}
