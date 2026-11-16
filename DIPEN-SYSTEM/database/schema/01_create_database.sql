-- Standalone MySQL 8.4 Database Creation & Verification Script for DIPEN_ERP
CREATE DATABASE IF NOT EXISTS DIPEN_ERP
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Note: Full table DDL is managed canonically by Flyway in:
-- backend/src/main/resources/db/migration/V1__init_schema.sql
-- backend/src/main/resources/db/migration/V2__seed_initial_data.sql
