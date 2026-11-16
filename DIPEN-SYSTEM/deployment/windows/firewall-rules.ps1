# Run in an elevated PowerShell prompt ("Run as Administrator") on the Server PC
# Allows other PCs on your office/factory network (whether Windows marks the Wi-Fi as Private or Public)
# to open DIPEN SYSTEM on port 8080 while keeping MySQL (port 3306) restricted to localhost.

$existing = Get-NetFirewallRule -DisplayName "DIPEN SYSTEM ERP (Port 8080)" -ErrorAction SilentlyContinue
if ($existing) {
  Remove-NetFirewallRule -DisplayName "DIPEN SYSTEM ERP (Port 8080)"
}

New-NetFirewallRule -DisplayName "DIPEN SYSTEM ERP (Port 8080)" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 8080 `
  -Action Allow `
  -Profile Any

Write-Host "Firewall rule 'DIPEN SYSTEM ERP (Port 8080)' enabled for other PCs on the network." -ForegroundColor Green
Write-Host ""
Write-Host "Share one of these IPv4 links with other PCs (do NOT use fe80::... link-local IPv6):" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" } | ForEach-Object {
  Write-Host ("  http://{0}:8080/" -f $_.IPAddress) -ForegroundColor Yellow
}
Write-Host ("  http://{0}:8080/" -f $env:COMPUTERNAME) -ForegroundColor Yellow
