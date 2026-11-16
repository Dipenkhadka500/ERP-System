@echo off
setlocal
echo ============================================================================
echo DIPEN SYSTEM — MySQL 8.4 Initial Database Provisioning (Windows 11)
echo ============================================================================
set MYSQL_EXE="C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe"
if not exist %MYSQL_EXE% (
  set MYSQL_EXE=mysql
)

set /p MYSQL_ROOT_PWD="Enter MySQL root password: "
set /p DIPEN_APP_PWD="Enter new password for dipen_app user: "

echo Creating DIPEN_ERP database and application account...
%MYSQL_EXE% -u root -p"%MYSQL_ROOT_PWD%" -e "CREATE DATABASE IF NOT EXISTS DIPEN_ERP CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'dipen_app'@'localhost' IDENTIFIED BY '%DIPEN_APP_PWD%'; GRANT ALL PRIVILEGES ON DIPEN_ERP.* TO 'dipen_app'@'localhost'; GRANT PROCESS ON *.* TO 'dipen_app'@'localhost'; FLUSH PRIVILEGES;"

if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] MySQL provisioning failed. Verify MySQL 8.4 service is running.
  exit /b 1
)

echo Database DIPEN_ERP is ready. Flyway will initialize all tables on first Spring Boot launch.
endlocal
