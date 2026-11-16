# Stage A – Existing System Audit & Complete Module Inventory
**Source of Truth Audited:** `public/gas/Code.js` (4,789 lines) & `public/gas/Index.html` (8,005 lines)  
**Connected Google Spreadsheets:**
- **Operations & Inventory DB:** `1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs` (15 worksheets: 9 business + 6 system)
- **Procurement & Tender DB:** `16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY` (12 worksheets)

---

## 1. Exact Module & Submodule Inventory

### A. Authentication, Live Header & Security
- **Login Screen (`#loginScreen`)**: User ID / Email + Password authentication, session token storage (`BIRAT_ERP_AUTH_TOKEN`), session TTL `21,600` seconds (6 hours), explicit logout (`logoutUser`).
- **Live Date & Time Header**: 1-second real-time clock in `Asia/Kathmandu` timezone across every view.
- **Preserved Accounts & Role Mapping:**
  1. `dipen.khadka@birathralthcare.com` (alias `dipen.khadka@birathealthcare.com`) → **Super Admin** (`Dipen Khadka`)
  2. `sajal.khadka@birathealthcare.com` → **Operations Manager** (`Sajal Khadka`)
  3. `dispatch@birathealthcare.com` → **Dispatch Officer** (`Dispatch Officer`)
  4. `production@birathealthcare.com` → **Production Officer** (`Production Officer`)
- **Preserved Roles (7) & Permissions (20):**
  - `Super Admin`: All 20 permissions (`ITEM_MANAGE`, `PRODUCTION_WRITE`, `RECEIPT_WRITE`, `DISPATCH_WRITE`, `ISSUE_WRITE`, `ISSUE_FG`, `STOCK_VIEW`, `REPORT_GENERATE`, `REPORT_SUBMIT`, `STOCK_ADJUST`, `TX_EDIT`, `TX_CANCEL`, `NEGATIVE_OVERRIDE`, `SYNC_ADMIN`, `AUDIT_VIEW`, `USER_MANAGE`, `PROCUREMENT_VIEW`, `PROCUREMENT_WRITE`, `PROCUREMENT_APPROVE`, `TENDER_WRITE`)
  - `Operations Manager`: 19 permissions (all except `USER_MANAGE`)
  - `Procurement Officer`: `PROCUREMENT_VIEW`, `PROCUREMENT_WRITE`, `PROCUREMENT_APPROVE`, `TENDER_WRITE`, `STOCK_VIEW`, `REPORT_GENERATE`
  - `Store Officer`: `RECEIPT_WRITE`, `ISSUE_WRITE`, `STOCK_VIEW`, `REPORT_GENERATE`, `TX_EDIT`
  - `Production Officer`: `PRODUCTION_WRITE`, `ISSUE_WRITE`, `STOCK_VIEW`, `REPORT_GENERATE`, `TX_EDIT`
  - `Dispatch Officer`: `DISPATCH_WRITE`, `STOCK_VIEW`, `REPORT_GENERATE`, `TX_EDIT`
  - `Viewer`: `STOCK_VIEW`, `REPORT_GENERATE`

### B. Operations & Inventory Module
1. **Operations Dashboard (`dashboard`)**: KPI cards (Total Active Items, Finished Goods Stock, Raw Material Stock, Low Stock Alerts, Pending Receipts, Total Transactions), Chart.js stock & movement charts, reorder alert table, recent transaction feed.
2. **Item Master (`item-master`)**:
   - 6 fixed categories with automatic starting sequences: `WIP` (`2001`), `Finished Goods` (`3001`), `Raw Material` (`4001`), `Packing Material` (`5001`), `Stores & Spares` (`6001`), `Others` (`7001`).
   - Dual-UOM conversion support (`Index Unit` + `Conversion Unit` + `Conversion Quantity`), HSN Code, Brand Categories, Reorder Level, Active/Inactive toggle, Safe Delete (blocked if ledger history exists).
3. **Production (`production`)**: Records Finished Goods, WIP, or Packing Material production (`IN`), Batch/Lot Number, Production Reference, Unit Rate, Currency, Date-Synced Exchange Rate, NPR Total Value, Print/Excel/PDF exports, Edit & Cancel transaction modals.
4. **Dispatch (`dispatch`)**: Strict `Finished Goods` only (`OUT`), Dual-UOM input (`Secondary Qty CTN` + `Index Qty Pkt`), Customer/Party Name, Challan No, Invoice No, Vehicle No, Negative stock check (overrideable only by `NEGATIVE_OVERRIDE` + `ALLOW_NEGATIVE_STOCK_OVERRIDE=TRUE`), Unit Rate/Currency/FX/NPR, Print/Excel/PDF exports.
5. **Goods Receipt (`goods-receipt`)**: `IN` transactions for all 6 categories. Supports **both** linking an **Approved Purchase Order (PO Reference)** (auto-filling supplier, currency, PO exchange rate, and item unit rates + updating PO `ReceivedQty`, `PendingQty`, `ReceivedStatus`) **and** direct item selection. Print/Excel/PDF exports.
6. **Material Issue (`issue`)**: `OUT` transactions for Raw Material, Packing Material, WIP, Stores & Spares, Others (and Finished Goods only when `AUTHORIZE_FG_ISSUE=TRUE`). Department/Production Section, Issue Reference, Issued To, Unit Rate/Currency/FX/NPR, Print/Excel/PDF exports.
7. **Category Stock Registers (`stock-finished`, `stock-raw`, `stock-packing`)**: Calculated strictly from `ACTIVE` ledger rows with optional date/month/year/brand filters, Dual-UOM breakdown, Print/Excel/PDF exports.
8. **All Stock Balance & Daily Stock Report (`all-stock`, `daily-report`)**:
   - Category-separated page breaks in Print & PDF exports, multi-sheet / grouped Excel export (`.xlsx`), NO CSV export.
   - Daily Stock Report snapshot submission & historical lookup (`_SYS_Daily_Reports`).
9. **Sync Console & Audit Logs (`sync-console`, `audit-log`)**: Working sheet sync triggers, reconciliation, sync error resolution, settings management, Google Drive / DB backup, and full audit history.

### C. Procurement & Tender Module
1. **Procurement Dashboard (`proc-dashboard`)**: Total PO Value (NPR), Pending POs, Supplier Outstanding vs Paid (NPR), Customer Tender Outstanding (NPR), Shipments in Transit (India vs 3rd Country), Indents/Quotes/Tenders KPIs, Monthly Procurement Trend & Tender Breakdown Chart.js visuals.
2. **Purchase Indents (`proc-indents`)**: Full CRUD + Approve/Reject workflow (`IND-xxxx`).
3. **Quotations & PI (`proc-quotations`)**: Multi-item JSON line items, Incoterms, Freight & Other Charges, Currency + Date-Synced Exchange Rate, `TotalAmountNPR`, MD Approval (`Approved`/`Rejected`/`Pending`), Full Edit, Print/Excel/PDF.
4. **Purchase Orders (`proc-pos`)**: Creation standalone or linked from Approved Quotations, line-item editable Qty & Rate modal, Date-Synced Exchange Rate, `TotalValueNPR`, MD Approval (`Approved`/`Rejected`), Delivery Receipt Status (`Pending Receipt` / `Partially Received` / `Fully Received`), PO Detail modal with dedicated **Print PO**, **Excel**, and **PDF** buttons.
5. **Import LC & TT Payments (`proc-lctt`)**: Linked to PO, Bank Name, Payment Type (`LC`/`TT`), Opening Date, Maturity Date, Currency, Date-Synced Exchange Rate, `AmountNPR`, **editable Status** (`Pending` / `In Progress` / `Completed`), Full Edit & Exports.
6. **Shipments & Logistics (`proc-shipments`)**: India vs Third Country tracking, Freight Forwarder link, POL/POD, Container No, BL/AWB No, ETD/ETA, Actual Departure/Arrival, Customs Status, Freight Amount (NPR), Shipment Status.
7. **Suppliers & Freight Forwarders (`proc-suppliers`, `proc-forwarders`)**: Master directories with PAN/GST, Lead Time Days, Default Currency, Rating.
8. **Tenders & Won Tender Tracking (`proc-tenders`, `proc-tender-tracking`)**:
   - `Tenders`: Tender No, Name, Address, Contact, Publication/Deadline, Item, Qty, Unit, Estimated Rate, Bid Security, Result (`Pending`/`Win`/`Lose`). Setting Result to `Win` automatically creates a `TenderTracking` record (`TRK-{TenderNo}`).
   - `TenderTracking`: Editable `Quantity`, `RateIncVat`, `Amount` (`Qty * RateIncVat`), Milestone statuses & dates (`Muchulka`, `LOI`, `LOA`, `PG`, `Sample`), `ProductionStatus`, `DispatchStatus`, `DispatchDate`, Print/Excel/PDF exports.
9. **Currency Exchange Rates (`proc-exchange-rates`)**: Base `NPR`, date-wise rates for `USD`, `INR`, `EUR`, `GBP`, `CNY`. Fallback order: exact date -> latest prior effective date -> earliest configured date -> system defaults (`USD=135.50, INR=1.6015, EUR=146.20, GBP=172.80, CNY=18.60`). Supports `applyToExistingRecords` batch recalculation across matching-date `Quotations`, `PurchaseOrders`, `LCTTPayments`, and active non-NPR Operations `stock_ledger` entries.

---

## 2. Preserved Calculation Rules (Reproduced with `BigDecimal`)
1. **Dual-UOM Conversion (`convertToBaseUnit`)**:
   - If `enteredUom == indexUnit` → `baseQty = enteredQty`.
   - If `enteredUom == conversionUnit` (`conversionQty > 0`) → `baseQty = enteredQty * conversionQty` (scale 4).
   - Dispatch dual input: `baseQty = (secondaryQty * conversionQty) + indexQty`.
2. **Quotient + Remainder Dual-UOM Display (`decomposeToDualUOM`)**:
   - `wholeSecondary = floor(abs(baseQty) / conversionQty)` (integer)
   - `remainder = abs(baseQty) - (wholeSecondary * conversionQty)` (rounded scale 4)
3. **Stock Balance (`calculateStockMap`)**:
   - Strictly sums `ACTIVE` ledger rows (`status = 'ACTIVE'`), `Closing = TotalIn - TotalOut`.
   - Historical cutoff `asOfDate`: `OpeningBeforeDate` (`txDate < cutoff`), `PeriodIn`/`PeriodOut` (`txDate == cutoff`).
4. **Transaction Rate & FX Conversion (`enrichTxRateMeta`, `ExchangeRateService`)**:
   - `totalAmount = enteredQty * unitRate`
   - `totalAmountNPR = totalAmount * exchangeRate` (`HALF_UP`, scale 2).
5. **Idempotent Hash**:
   - MD5 over `txId|txType|txDate|itemCode|enteredQty|enteredUom|direction|status`.
