package com.birathealthcare.dipen.controller;

import com.birathealthcare.dipen.dto.ApiResponse;
import com.birathealthcare.dipen.security.PermissionChecker;
import com.birathealthcare.dipen.service.ExchangeRateService;
import com.birathealthcare.dipen.service.ProcurementService;
import com.birathealthcare.dipen.service.SystemVersionService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class ProcurementController {

  private final ProcurementService procurementService;
  private final ExchangeRateService fxService;
  private final PermissionChecker permissionChecker;
  private final SystemVersionService versionService;

  public ProcurementController(
      ProcurementService procurementService,
      ExchangeRateService fxService,
      PermissionChecker permissionChecker,
      SystemVersionService versionService
  ) {
    this.procurementService = procurementService;
    this.fxService = fxService;
    this.permissionChecker = permissionChecker;
    this.versionService = versionService;
  }

  @GetMapping("/procurement/dashboard")
  public ApiResponse dashboard(@RequestParam(required = false) String period) {
    return ApiResponse.ok("Procurement dashboard loaded.",
        procurementService.getDashboard(period != null ? Map.of("period", period) : Map.of()),
        versionService.getCurrentVersion());
  }

  @GetMapping("/procurement/lookups")
  public ApiResponse lookups() {
    return ApiResponse.ok("Procurement lookups loaded.",
        procurementService.getLookups(),
        versionService.getCurrentVersion());
  }

  @GetMapping("/procurement/{sheetName}")
  public ApiResponse getRecords(@PathVariable String sheetName, @RequestParam Map<String, Object> filters) {
    return ApiResponse.ok(sheetName + " loaded.",
        Map.of("records", procurementService.getRecords(sheetName, filters)),
        versionService.getCurrentVersion());
  }

  @PostMapping("/procurement/{sheetName}")
  public ApiResponse saveRecord(@PathVariable String sheetName, @RequestBody Map<String, Object> recordData) {
    Map<String, Object> res = procurementService.saveRecord(sheetName, recordData);
    return ApiResponse.ok("Record " + res.get("id") + " saved in " + sheetName + ".", res, versionService.getCurrentVersion());
  }

  @DeleteMapping("/procurement/{sheetName}/{recordId}")
  public ApiResponse deleteRecord(@PathVariable String sheetName, @PathVariable String recordId) {
    return ApiResponse.ok("Record " + recordId + " deleted.",
        procurementService.deleteRecord(sheetName, recordId),
        versionService.getCurrentVersion());
  }

  @PostMapping("/procurement/{moduleName}/{id}/approval")
  public ApiResponse setApproval(@PathVariable String moduleName, @PathVariable String id, @RequestBody Map<String, String> body) {
    String msg = procurementService.setApproval(moduleName, id, body.get("status"), body.get("remarks"));
    return ApiResponse.ok(msg, versionService.getCurrentVersion());
  }

  @GetMapping("/procurement/approved-pos-for-grn")
  public ApiResponse approvedPOsForGrn() {
    return ApiResponse.ok("Approved Purchase Orders loaded.",
        Map.of("purchaseOrders", procurementService.getApprovedPOsForGoodsReceipt()),
        versionService.getCurrentVersion());
  }

  @GetMapping("/exchange-rates/by-date")
  public ApiResponse getRateByDate(@RequestParam(required = false) String date) {
    permissionChecker.assertAnyPermission("PROCUREMENT_VIEW", "STOCK_VIEW");
    Map<String, Object> rateInfo = fxService.resolveRatesForDate(date);
    return ApiResponse.ok("Exchange rate resolved for " + rateInfo.get("RateDate") + ".",
        Map.of("rateDate", rateInfo.get("RateDate"), "exchangeRates", rateInfo),
        versionService.getCurrentVersion());
  }

  @PostMapping("/exchange-rates")
  public ApiResponse saveExchangeRates(@RequestBody Map<String, Object> body) {
    Map<String, Object> res = fxService.saveExchangeRates(body);
    return ApiResponse.ok("Exchange rates saved for " + res.get("rateDate") + ".", res, versionService.getCurrentVersion());
  }
}
