# Stage G–I – Windows 11 Deployment, Administration, Backup & Rollback Guide

## 1. Windows 11 Server Prerequisites (8 GB RAM, NPR 0 Stack)
1. **Java 21 (LTS):** Install Eclipse Temurin JDK 21 (MSI installer) and verify `java -version`.
2. **MySQL Community Server 8.4 LTS:** Install MySQL 8.4 Server + Command Line Tools (`mysql`, `mysqldump`), configure `InnoDB` buffer pool `~1G` (optimized for 8 GB RAM Windows host), bind locally (`127.0.0.1` or LAN IP with firewall restricted — **never expose port 3306 publicly**).
3. **Apache Maven 3.9+:** Add `mvn\bin` to System `PATH`.
4. **Google Sheets API Service Account (for Two-Way Sheet Entry & Sync):**
   - Place the Google Service Account JSON key in `C:\dipen-erp\secrets\google-service-account.json` (read-only ACL to service account user, never inside `frontend/`).
   - Share both Google Spreadsheets (`1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs` and `16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY`) with the Service Account's `client_email` as **Editor**.

---

## 2. Database Initialization & Environment Configuration
Run `deployment\windows\setup-mysql.bat` as Administrator (or run manually):
```sql
CREATE DATABASE IF NOT EXISTS DIPEN_ERP
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```
Flyway automatically runs `V1__init_schema.sql` and `V2__seed_initial_data.sql` at Spring Boot startup (`spring.jpa.hibernate.ddl-auto=validate`).

Set environment variables using `deployment\configuration\dipen-env.example.bat`:
- `DIPEN_DB_URL=jdbc:mysql://localhost:3306/DIPEN_ERP?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Kathmandu&characterEncoding=UTF-8`
- `DIPEN_DB_USER=dipen_app`
- `DIPEN_DB_PASSWORD=<strong-password>`
- `DIPEN_GOOGLE_CREDENTIALS_PATH=C:\dipen-erp\secrets\google-service-account.json`
- `DIPEN_BACKUP_DIR=D:\DIPEN_BACKUPS` (separate drive/folder from MySQL `ProgramData\MySQL` data directory)

---

## 3. Password Security & Role Access
- Existing user accounts are seeded with their original SHA-256 digests cleanly in `erp_users.legacy_sha256_hash` (never plaintext) and upgrade transparently to **BCrypt (`$2a$10$...`)** on first login.
- Authorized administrators can reset user passwords or adjust roles/status via the Users/Sync Console or `POST /api/auth/change-password`.
- All RBAC checks preserve the exact 7-role / 20-permission matrix from `Code.js`.

---

## 4. Two-Way Google Sheets Workflow
- **Direct ERP Entry:** All create/edit/delete/approval actions write transactionally to MySQL `DIPEN_ERP`.
- **Google Sheets Bulk Entry / Sync:**
  1. Preview changes safely from Google Sheets: `POST /api/sheets/import/preview` (validates UOMs, categories, duplicates, and shows new vs updated vs error rows without mutating MySQL).
  2. Commit validated rows: `POST /api/sheets/import/commit` (wrapped in `@Transactional` so any failure rolls back completely).
  3. Export official MySQL registers, working sheets, or Procurement records back to Google Sheets: `POST /api/sheets/export`.
  - MySQL always remains the authoritative database; existing records are never silently overwritten without explicit preview confirmation or matching record hash checks.

---

## 5. Automated MySQL Backups & Verified Restoration
- Spring Boot runs an automated daily scheduled backup (`02:00 AM Asia/Kathmandu`) executing `mysqldump --single-transaction --routines --triggers DIPEN_ERP`, verifies file non-emptiness & SQL footer integrity, logs status in `backup_history`, and applies 30-day retention cleanup.
- Administrators can also run manual backups from the ERP Sync/Admin Console (`POST /api/admin/backups/run`) or via `deployment\backup\backup-dipen-erp.ps1`.
- **Off-PC Copy:** Sync `D:\DIPEN_BACKUPS` to an encrypted external USB/NAS or encrypted cloud folder outside the office PC.
- **Restore Verification:** Test `deployment\backup\restore-dipen-erp.ps1` against a scratch database (`DIPEN_ERP_RESTORE_TEST`) before production cutover.

---

## 6. Safe Cutover & Rollback Plan
### Pre-Cutover Checklist
1. Take a full manual backup of both Google Spreadsheets (`backupSpreadsheet()`).
2. Run **Google Sheets -> MySQL** initial import & verify counts in `documentation/02_DATABASE_AND_SHEETS_MAPPING.md`.
3. Verify all 15 Operations functional checks + Procurement/Tender + Date-Wise Exchange Rate tests pass against `DIPEN_ERP`.
4. Confirm automated backup & test restore succeed.

### Cutover Steps
1. Announce brief freeze window in existing GAS Web App.
2. Perform final incremental import from Google Sheets into MySQL `DIPEN_ERP`.
3. Reconcile record counts and closing stock balances (`All Stock Balance`).
4. Start Spring Boot Windows service (`http://<LAN-IP>:8080`, HTTPS/VPN for remote access).
5. Retain original GAS deployment & Google Sheets intact as read-only fallback.

### Emergency Rollback Plan
1. Stop incoming entries in `DIPEN-SYSTEM` (stop Windows service).
2. Export `stock_ledger`, `operations_audit_logs`, and `proc_*` delta records since cutover for reconciliation.
3. Restore last verified `mysqldump` snapshot if MySQL rollback is needed, or re-enable original GAS ERP URL while reconciling delta transactions.
4. **Never delete original Google Spreadsheets during cutover or rollback.**
