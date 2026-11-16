# Run in an elevated PowerShell prompt on the Windows 11 Office Server
# Allows LAN clients on the local factory/office subnet to reach DIPEN SYSTEM (port 8080)
# while keeping MySQL (port 3306) bound to localhost only.

New-NetFirewallRule -DisplayName "DIPEN SYSTEM ERP (Port 8080)" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 8080 `
  -Action Allow `
  -Profile Private

Write-Host "Firewall rule 'DIPEN SYSTEM ERP (Port 8080)' added for Private LAN profile." -ForegroundColor Green
