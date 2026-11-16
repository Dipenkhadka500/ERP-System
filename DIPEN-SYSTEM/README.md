# DIPEN SYSTEM – MANUFACTURING ERP
**Birat Healthcare Industries Pvt. Ltd.**

Migration & Upgrade Architecture:
- **Frontend:** HTML5 + CSS3 + Vanilla JavaScript (Bootstrap 5.3, Chart.js, SheetJS XLSX, jsPDF, Font Awesome Free)
- **Backend:** Java 21 + Spring Boot 3.4 (REST API, Spring Security + BCrypt, Spring Data JPA, JDBC, Flyway, Scheduled Backups)
- **Primary Authoritative Database:** MySQL Community Server 8.4 LTS (`DIPEN_ERP`)
- **Spreadsheet Integration:** Two-way Google Sheets API sync (`Operations DB: 1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs`, `Procurement & Tender DB: 16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY`)
- **Target Host:** Windows 11 Office Server (8 GB RAM, 2–5 concurrent users, NPR 0 software/hosting license cost)

---

## Project Directory Structure

```text
DIPEN-SYSTEM/
├── backend/
│   ├── src/main/java/com/birathealthcare/dipen/
│   │   ├── config/          # SecurityConfig, WebConfig, JacksonConfig, CacheConfig
│   │   ├── controller/      # REST APIs + /api/rpc/{fnName} parity bridge
│   │   ├── dto/             # ApiResponse envelope & request/response DTOs
│   │   ├── entity/          # JPA Entities mapped to DIPEN_ERP MySQL tables
│   │   ├── exception/       # ErpBusinessException & GlobalExceptionHandler
│   │   ├── integration/     # GoogleSheetsClientProvider & GoogleSheetsSyncService
│   │   ├── mapper/          # Schema & entity mappers
│   │   ├── repository/      # Spring Data JPA repositories
│   │   ├── security/        # TokenAuthFilter, ErpPrincipal, AuthService, PermissionChecker
│   │   ├── service/         # Business logic, BigDecimal financial/stock engine, BackupService
│   │   ├── validation/      # Category routing & UOM validators
│   │   └── DipenApplication.java
│   ├── src/main/resources/
│   │   ├── application.properties
│   │   ├── db/migration/    # Flyway V1__init_schema.sql, V2__seed_initial_data.sql
│   │   └── static/          # Production frontend served directly by Spring Boot
│   └── pom.xml
├── database/
│   ├── schema/              # Standalone MySQL 8.4 DDL reference
│   ├── migration/           # Google Sheets -> MySQL migration helpers & verification queries
│   └── backup/              # Local backup target folder (configure off-drive in production)
├── frontend/
│   ├── index.html
│   ├── css/dipen-erp.css
│   ├── js/api-bridge.js
│   ├── js/erp-app.js
│   ├── assets/
│   └── modules/
├── spreadsheet-integration/
│   ├── import/
│   ├── export/
│   └── templates/
├── deployment/
│   ├── windows/             # Windows 11 setup, startup, firewall, and Task Scheduler scripts
│   ├── backup/              # Automated mysqldump backup & restore scripts
│   └── configuration/       # Environment template & JVM tuning
└── documentation/
    ├── 01_SYSTEM_AUDIT_AND_MODULE_INVENTORY.md
    ├── 02_DATABASE_AND_SHEETS_MAPPING.md
    └── 03_DEPLOYMENT_ADMIN_AND_ROLLBACK_GUIDE.md
```

---

## Quick Start (Windows 11 Target Server)

1. Install **Eclipse Temurin JDK 21**, **Apache Maven 3.9+**, and **MySQL Community Server 8.4 LTS**.
2. Create database `DIPEN_ERP` using `deployment/windows/setup-mysql.bat` (or `CREATE DATABASE DIPEN_ERP CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`).
3. Set environment variables (`DIPEN_DB_USER`, `DIPEN_DB_PASSWORD`, and optional `DIPEN_GOOGLE_CREDENTIALS_PATH`).
4. Build and run:
   ```cmd
   cd DIPEN-SYSTEM\backend
   mvn clean package -DskipTests
   java -Xms256m -Xmx1024m -jar target\dipen-erp-1.0.0.jar
   ```
5. Open `http://localhost:8080` and sign in using the preserved ERP credentials.
6. Read `documentation/03_DEPLOYMENT_ADMIN_AND_ROLLBACK_GUIDE.md` before migrating production Google Sheets records and scheduling daily automated backups.
