@echo off
setlocal
set SCRIPT_DIR=%~dp0
if exist "C:\DIPEN-SYSTEM\dipen-env.bat" (
  call "C:\DIPEN-SYSTEM\dipen-env.bat"
) else if exist "%SCRIPT_DIR%..\configuration\dipen-env.bat" (
  call "%SCRIPT_DIR%..\configuration\dipen-env.bat"
)

if "%SERVER_PORT%"=="" set SERVER_PORT=8080
if "%JAVA_OPTS%"=="" set JAVA_OPTS=-Xms256m -Xmx1024m -XX:+UseG1GC -Duser.timezone=Asia/Kathmandu
set JAR_PATH=%SCRIPT_DIR%..\..\backend\target\dipen-erp-1.0.0.jar

if not exist "%JAR_PATH%" (
  echo JAR not found at %JAR_PATH%. Building with Maven...
  pushd "%SCRIPT_DIR%..\..\backend"
  call mvn clean package -DskipTests
  popd
)

echo ============================================================================
echo Starting DIPEN SYSTEM ERP Server on port %SERVER_PORT%...
echo Share the IPv4 or Computer Name URL below with other PCs on your network
echo ^(Do NOT use fe80::...%%4 link-local IPv6 addresses in browsers^):
echo   Local PC:   http://localhost:%SERVER_PORT%/
echo   PC Name:    http://%COMPUTERNAME%:%SERVER_PORT%/
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo   LAN IPv4:   http://%%b:%SERVER_PORT%/
)
echo ============================================================================

java %JAVA_OPTS% -jar "%JAR_PATH%" --server.address=0.0.0.0 --server.port=%SERVER_PORT%
endlocal
