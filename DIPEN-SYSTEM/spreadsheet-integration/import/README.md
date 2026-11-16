# Google Sheets Import Pipeline (Google Sheets -> MySQL DIPEN_ERP)

Implemented in Java class `com.birathealthcare.dipen.integration.GoogleSheetsSyncService` and exposed via:
- `POST /api/sheets/import/preview` (`{ "scope": "OPERATIONS" | "PROCUREMENT", "sheetName": "..." }`)
- `POST /api/sheets/import/commit` (`{ "scope": "OPERATIONS" | "PROCUREMENT", "sheetName": "..." }`)

Workflow: Preview -> Row Classification (`NEW` / `UPDATE`) & Item Master / UOM Validation -> Transactional MySQL Upsert -> Audit & Sync Log recording (`sheets_sync_logs` & `sync_errors`).
