@echo off
setlocal
set SCRIPT_DIR=%~dp0
if exist "C:\DIPEN-SYSTEM\dipen-env.bat" (
  call "C:\DIPEN-SYSTEM\dipen-env.bat"
) else if exist "%SCRIPT_DIR%..\configuration\dipen-env.bat" (
  call "%SCRIPT_DIR%..\configuration\dipen-env.bat"
)

if "%JAVA_OPTS%"=="" set JAVA_OPTS=-Xms256m -Xmx1024m -XX:+UseG1GC -Duser.timezone=Asia/Kathmandu
set JAR_PATH=%SCRIPT_DIR%..\..\backend\target\dipen-erp-1.0.0.jar

if not exist "%JAR_PATH%" (
  echo JAR not found at %JAR_PATH%. Building with Maven...
  pushd "%SCRIPT_DIR%..\..\backend"
  call mvn clean package -DskipTests
  popd
)

echo Starting DIPEN SYSTEM ERP Server on port %SERVER_PORT%...
java %JAVA_OPTS% -jar "%JAR_PATH%"
endlocal
