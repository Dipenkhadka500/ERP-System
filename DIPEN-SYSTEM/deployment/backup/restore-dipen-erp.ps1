# ============================================================================
# DIPEN SYSTEM — Verified MySQL Backup Restore Script (Windows 11)
# Usage: .\restore-dipen-erp.ps1 -SqlFile "D:\DIPEN_BACKUPS\DIPEN_ERP_2026-11-16_020000.sql"
# ============================================================================
param(
  [Parameter(Mandatory = $true)]
  [string]$SqlFile,
  [string]$MysqlExe = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe",
  [string]$DbUser = "root",
  [string]$DbPassword = $env:MYSQL_ROOT_PWD
)

if (-not (Test-Path $SqlFile)) {
  Write-Error "SQL dump file not found: $SqlFile"
  exit 1
}

if (Test-Path "$SqlFile.sha256") {
  $expected = ((Get-Content "$SqlFile.sha256" -Raw).Trim().Split(" ")[0]).ToUpper()
  $actual = (Get-FileHash -Path $SqlFile -Algorithm SHA256).Hash.ToUpper()
  if ($expected -ne $actual) {
    Write-Error "Checksum mismatch! Expected $expected, actual $actual. Aborting restore."
    exit 2
  }
  Write-Host "SHA-256 checksum verified: $actual" -ForegroundColor Green
}

Write-Warning "Restoring DIPEN_ERP from $SqlFile. Ensure DIPEN SYSTEM service is stopped before restore."
$env:MYSQL_PWD = $DbPassword
Get-Content -Path $SqlFile -Raw | & $MysqlExe -u $DbUser
$exit = $LASTEXITCODE
$env:MYSQL_PWD = ""

if ($exit -ne 0) {
  Write-Error "MySQL restore failed with exit code $exit"
  exit $exit
}

Write-Host "Database DIPEN_ERP restored successfully from $SqlFile" -ForegroundColor Green
