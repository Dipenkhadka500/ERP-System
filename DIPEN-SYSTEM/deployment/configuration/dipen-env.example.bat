@echo off
REM ============================================================================
REM DIPEN SYSTEM — Windows 11 Production Environment Variables Template
REM Copy this file to C:\DIPEN-SYSTEM\dipen-env.bat and customize passwords.
REM NEVER commit real passwords or Service Account JSON keys to source control.
REM ============================================================================

set SERVER_PORT=8080
set SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3306/DIPEN_ERP?useSSL=false^&allowPublicKeyRetrieval=true^&serverTimezone=Asia/Kathmandu^&characterEncoding=UTF-8
set DIPEN_DB_USER=dipen_app
set DIPEN_DB_PASSWORD=CHANGE_ME_STRONG_DB_PASSWORD

REM Google Sheets Integration (Optional — required for Two-Way Google Sheets Sync)
set DIPEN_GOOGLE_CREDENTIALS_PATH=C:\DIPEN-SYSTEM\secrets\google-service-account.json
set DIPEN_OPS_SHEET_ID=1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs
set DIPEN_PROC_SHEET_ID=16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY

REM Automated MySQL Backup Configuration (Windows 11)
set DIPEN_BACKUP_ENABLED=true
set DIPEN_BACKUP_DIR=D:\DIPEN_BACKUPS
set DIPEN_MYSQLDUMP_PATH=C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe
set DIPEN_BACKUP_CRON=0 0 2 * * *
set DIPEN_BACKUP_RETENTION_DAYS=30

REM Office 8GB RAM Conservative JVM Sizing (~1.0 GB max heap)
set JAVA_OPTS=-Xms256m -Xmx1024m -XX:+UseG1GC -Duser.timezone=Asia/Kathmandu
