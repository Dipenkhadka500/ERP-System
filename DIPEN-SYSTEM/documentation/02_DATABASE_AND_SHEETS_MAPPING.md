# Stage B – Complete Database & Google Sheets Column Mapping
**Target MySQL Database:** `DIPEN_ERP` (MySQL 8.4 Community, `InnoDB`, `utf8mb4_unicode_ci`)

---

## 1. Operations & Inventory Spreadsheet (`1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs`)

| Google Sheet Worksheet | Exact Sheet Headers | MySQL Target Table (`DIPEN_ERP`) | Notes |
|---|---|---|---|
| `Item Master` | `Item Code`, `Item Name`, `Categories`, `Brand Categories`, `HSN Code`, `Index Unit`, `Fraction of Index Unit`, `Conversion Quantity`, `Conversion Unit`, `Reorder Level`, `Status`, `Created Date`, `Updated Date` | `item_master` | PK: `item_code` (VARCHAR 32) |
| `_SYS_Transaction_Ledger` | `Transaction ID`, `Transaction Type`, `Transaction Date`, `Item Code`, `Item Name`, `Category`, `Brand`, `Entered Quantity`, `Entered UOM`, `Converted Base Quantity`, `Stock Direction`, `Source Sheet`, `Source Row`, `Batch Number`, `Reference Number`, `Party / Section`, `Meta JSON`, `Remarks`, `Created By`, `Created At`, `Updated By`, `Updated At`, `Transaction Status`, `Record Hash` | `stock_ledger` | PK: `tx_id`; authoritative stock source (`status='ACTIVE'`); stores `unitRate`, `currency`, `exchangeRate`, `totalAmount`, `totalAmountNPR` as decimal columns + `meta_json` |
| `Production` | 18 cols (`Production ID` .. `Sync Status`) | `stock_ledger` (`tx_type='PRODUCTION'`) + Sheet Export View | Projected dynamically / synced with `Production` worksheet |
| `Dispatch` | 22 cols (`Dispatch ID` .. `Sync Status`) | `stock_ledger` (`tx_type='DISPATCH'`) + Sheet Export View | Projected dynamically / synced with `Dispatch` worksheet |
| `Goods Reciept` | 20 cols (`Receipt ID` .. `Sync Status`) | `stock_ledger` (`tx_type='GOODS_RECEIPT'`) + Sheet Export View | Preserves exact `'Goods Reciept'` sheet tab name |
| `Issue` | 19 cols (`Issue ID` .. `Sync Status`) | `stock_ledger` (`tx_type='ISSUE'`) + Sheet Export View | Projected dynamically / synced with `Issue` worksheet |
| `Finished Goods`, `Raw Material`, `Packing Material`, `All Stock Balance` | Derived register sheets | Computed SQL/Service views (`StockAndReportService`) | Exportable to Google Sheets / Excel / PDF |
| `_SYS_Audit_Log` | `Audit ID`, `Timestamp`, `User`, `Role`, `Action`, `Module`, `Target ID`, `Summary`, `Before JSON`, `After JSON` | `operations_audit_logs` | Immutable audit trail |
| `_SYS_Sync_Errors` | `Error ID`, `Timestamp`, `Sheet Name`, `Row Number`, `Item Code`, `Raw Data JSON`, `Error Message`, `Status`, `Resolved By`, `Resolved At` | `sync_errors` | Sync & reconciliation error tracking |
| `_SYS_Daily_Reports` | `Report ID`, `Report Date`, `Submitted By`, `Submitted At`, `Total Active Items`, `Stock In Count`, `Stock Out Count`, `Below Reorder Count`, `Zero Balance Count`, `Snapshot JSON`, `Status` | `daily_reports` | Unique `report_date` snapshot table |
| `_SYS_Users_RBAC` | `User Email / Key`, `Display Name`, `Role`, `Status`, `Updated At` | `erp_users`, `erp_roles`, `erp_permissions`, `erp_role_permissions` | Upgraded with `password_hash` (BCrypt), `legacy_sha256_hash`, `department` |
| `_SYS_Settings` | `Setting Key`, `Setting Value`, `Description`, `Updated At` | `erp_settings` | Also stores `ERP_DATA_VERSION`, `ERP_LAST_SYNC_AT` |

---

## 2. Procurement & Tender Spreadsheet (`16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY`)

| Google Sheet Worksheet | Exact Sheet Headers | MySQL Target Table (`DIPEN_ERP`) | Primary Key |
|---|---|---|---|
| `Indents` | `IndentNo`, `Date`, `Department`, `Requester`, `ItemCode`, `ItemName`, `RequiredQty`, `Unit`, `RequiredDeliveryDate`, `Priority`, `Status`, `ApprovedBy`, `ApprovalDate`, `Remarks`, `Timestamp` | `proc_indents` | `indent_no` |
| `Suppliers` | `SupplierId`, `Name`, `PanNo`, `GstNo`, `ContactPerson`, `Phone`, `Email`, `Country`, `Address`, `PaymentTerms`, `Currency`, `LeadTimeDays`, `Rating`, `Timestamp` | `proc_suppliers` | `supplier_id` |
| `FreightForwarder` | `ForwarderId`, `Name`, `Address`, `ContactPerson`, `Phone`, `Email`, `Rating`, `Remarks`, `Timestamp` | `proc_freight_forwarders` | `forwarder_id` |
| `Quotations` | `QuotationNo`, `IndentNo`, `SupplierId`, `SupplierName`, `Date`, `ValidityDate`, `Currency`, `ExchangeRate`, `Incoterms`, `FreightCharges`, `OtherCharges`, `Subtotal`, `TotalAmount`, `TotalAmountNPR`, `Status`, `MDApproval`, `MDApprovalDate`, `MDNotes`, `AttachmentName`, `AttachmentUrl`, `ItemsJSON`, `Timestamp` | `proc_quotations` + `proc_quotation_items` | `quotation_no` |
| `PurchaseOrders` | `PONo`, `QuotationNo`, `SupplierId`, `SupplierName`, `OrderDate`, `DeliveryTerms`, `PaymentTerms`, `Incoterms`, `Currency`, `ExchangeRate`, `TotalValue`, `TotalValueNPR`, `ExpectedDeliveryDate`, `Status`, `ApprovalStatus`, `ItemsJSON`, `ReceivedStatus`, `ReceivedQty`, `PendingQty`, `Timestamp` | `proc_purchase_orders` + `proc_purchase_order_items` | `po_no` |
| `LCTTPayments` | `PaymentId`, `PONo`, `SupplierName`, `BankName`, `PaymentType`, `Currency`, `Amount`, `ExchangeRate`, `AmountNPR`, `LCNumber`, `LCOpeningDate`, `MaturityDate`, `Status`, `PaymentStage`, `Remarks`, `Timestamp` | `proc_lc_tt_payments` | `payment_id` |
| `Shipments` | `ShipmentId`, `PONo`, `SupplierName`, `ForwarderId`, `ForwarderName`, `ShippingLine`, `OriginType`, `OriginCountry`, `POL`, `POD`, `ContainerNo`, `BLAWBNo`, `ETD`, `ETA`, `ActualDeparture`, `ActualArrival`, `CustomsStatus`, `FreightAmountNPR`, `ShipmentStatus`, `Remarks`, `Timestamp` | `proc_shipments` | `shipment_id` |
| `Tenders` | `TenderNo`, `TenderName`, `Address`, `ContactInfo`, `PublicationDate`, `SubmissionDeadline`, `ItemName`, `Quantity`, `Unit`, `EstimatedRate`, `BidSecurityAmount`, `BidSecurityStatus`, `Result`, `Remarks`, `Timestamp` | `proc_tenders` | `tender_no` |
| `TenderTracking` | `TrackingId`, `TenderNo`, `TenderName`, `Address`, `ContactInfo`, `LastSubmissionDate`, `ItemName`, `Unit`, `Quantity`, `RateIncVat`, `Amount`, `MuchulkaStatus`, `MuchulkaDate`, `LOIStatus`, `LOIDate`, `LOAStatus`, `LOADate`, `PGStatus`, `PGDate`, `SampleStatus`, `SampleDate`, `ProductionStatus`, `DispatchStatus`, `DispatchDate`, `Remarks`, `Timestamp` | `proc_tender_tracking` | `tracking_id` |
| `ExchangeRates` | `RateDate`, `USD`, `INR`, `EUR`, `GBP`, `CNY`, `NPR`, `Remarks`, `UpdatedBy`, `UpdatedAt` | `proc_exchange_rates` | `rate_date` |
| `AuditLog` | `LogId`, `Timestamp`, `UserEmail`, `Action`, `Module`, `RecordId`, `Details` | `proc_audit_logs` | `log_id` |
| `Settings` | `Key`, `Value`, `Description`, `UpdatedAt` | `proc_settings` | `setting_key` |

---

## 3. Migration Reconciliation Report Template

Execute `GET /api/sheets/reconciliation` (or inspect `database/migration/reconciliation_queries.sql`) after importing from Google Sheets into `DIPEN_ERP` to populate actual verified counts before production cutover:

| Module | Source Worksheet(s) | MySQL Table | Original Records | Migrated Records | Difference | Status |
|---|---|---|---:|---:|---:|---|
| Item Master | `Item Master` | `item_master` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
| Suppliers & Forwarders | `Suppliers`, `FreightForwarder` | `proc_suppliers`, `proc_freight_forwarders` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
| Purchase | `Indents`, `Quotations`, `PurchaseOrders`, `LCTTPayments`, `Shipments` | `proc_*` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
| Inventory & Opening/Ledger | `_SYS_Transaction_Ledger`, Working Sheets | `stock_ledger` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
| Production | `Production` (`tx_type='PRODUCTION'`) | `stock_ledger` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
| Dispatch | `Dispatch` (`tx_type='DISPATCH'`) | `stock_ledger` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
| Goods Receipt & Issue | `Goods Reciept`, `Issue` | `stock_ledger` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
| Tender | `Tenders`, `TenderTracking` | `proc_tenders`, `proc_tender_tracking` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
| Exchange Rates | `ExchangeRates` | `proc_exchange_rates` | _Run Import Preview_ | _Query DB_ | _0 expected_ | Pending Cutover |
