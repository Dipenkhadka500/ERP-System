@echo off
setlocal
echo ============================================================================
echo DIPEN SYSTEM — Public HTTPS Web App Link via Cloudflare Tunnel
echo Gives an instant https://... link that works from ANY PC anywhere.
echo Make sure start-dipen-erp.bat is already running on http://localhost:8080
echo ============================================================================

where cloudflared >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Installing Cloudflare Tunnel client via winget...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
)

echo Launching public HTTPS tunnel to http://localhost:8080 ...
cloudflared tunnel --url http://localhost:8080
endlocal
