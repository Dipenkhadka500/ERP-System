# ============================================================================
# DIPEN SYSTEM — PowerShell MySQL Full Backup & Checksum Verification
# Schedule daily via Windows Task Scheduler (or rely on built-in Spring Boot cron)
# ============================================================================
param(
  [string]$BackupDir = "D:\DIPEN_BACKUPS",
  [string]$MysqldumpPath = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqldump.exe",
  [string]$DbUser = "dipen_app",
  [string]$DbPassword = $env:DIPEN_DB_PASSWORD,
  [int]$RetentionDays = 30
)

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$ts = Get-Date -Format "yyyy-MM-dd_HHmmss"
$outFile = Join-Path $BackupDir "DIPEN_ERP_$ts.sql"

$env:MYSQL_PWD = $DbPassword
& $MysqldumpPath --single-transaction --routines --triggers --databases DIPEN_ERP -u $DbUser --result-file="$outFile"
$exit = $LASTEXITCODE
$env:MYSQL_PWD = ""

if ($exit -ne 0 -or -not (Test-Path $outFile)) {
  Write-Error "MySQL backup failed with exit code $exit"
  exit 1
}

$content = Get-Content -Path $outFile -Tail 20 -Raw
if ($content -notmatch "Dump completed") {
  Write-Error "Backup verification failed: Dump completed marker missing in $outFile"
  exit 2
}

$hash = (Get-FileHash -Path $outFile -Algorithm SHA256).Hash
"$hash  $(Split-Path $outFile -Leaf)" | Out-File -FilePath "$outFile.sha256" -Encoding utf8

# Enforce retention
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "DIPEN_ERP_*.sql*" | Where-Object { $_.LastWriteTime -lt $cutoff } | Remove-Item -Force

Write-Host "Backup verified OK: $outFile (SHA256: $hash)" -ForegroundColor Green
