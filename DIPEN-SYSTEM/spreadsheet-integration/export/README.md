# Google Sheets Export Pipeline (MySQL DIPEN_ERP -> Google Sheets)

Implemented in Java class `com.birathealthcare.dipen.integration.GoogleSheetsSyncService` and exposed via:
- `POST /api/sheets/export` (`{ "scope": "OPERATIONS" | "PROCUREMENT", "sheetName": "..." }`)

Pushes authoritative snapshots of Item Master, Production, Dispatch, Goods Reciept, Issue, All Stock Balance, Category Stock Registers, and Procurement & Tender tables back to Google Sheets for audit sharing and team visibility.
