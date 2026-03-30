@echo off
chcp 65001 > nul
setlocal

REM Run from this folder so -f Dockerfile.* and contexts match README / Dockerfiles.
cd /d "%~dp0"

echo.
echo [build-push] AgentArena - docker buildx build and push
echo.

REM Dockerfile.backend  - context ..\backend
REM Dockerfile.worker   - context ..         (repo root; COPY backend/...)
REM Dockerfile.frontend - context ..\frontend
REM No --build-arg TZ; use ARG default in each Dockerfile.

set "REGISTRY=ps-docker-registry.cn-beijing.cr.aliyuncs.com"
set "NAMESPACE=psdsframework"
set "DEFAULT_ARCH=amd64"

if "%~1"=="" (
    echo [ERROR] Missing argument: image type (backend^|worker^|frontend^)
    echo.
    call :show_help
    exit /b 1
)
if "%~2"=="" (
    echo [ERROR] Missing argument: version tag (e.g. v1.0.1^)
    echo.
    call :show_help
    exit /b 1
)

set "IMAGE_TYPE=%~1"
set "VERSION=%~2"
set "ARCH=%~3"
if "%ARCH%"=="" set "ARCH=%DEFAULT_ARCH%"

if /i "%IMAGE_TYPE%"=="backend" (
    set "IMAGE_NAME=agentarena-backend"
    set "DOCKERFILE=Dockerfile.backend"
    set "BUILD_CTX=..\backend"
) else if /i "%IMAGE_TYPE%"=="worker" (
    set "IMAGE_NAME=agentarena-worker"
    set "DOCKERFILE=Dockerfile.worker"
    set "BUILD_CTX=.."
) else if /i "%IMAGE_TYPE%"=="frontend" (
    set "IMAGE_NAME=agentarena-frontend"
    set "DOCKERFILE=Dockerfile.frontend"
    set "BUILD_CTX=..\frontend"
) else (
    echo [ERROR] Image type must be backend, worker, or frontend
    call :show_help
    exit /b 1
)

if /i not "%ARCH%"=="amd64" if /i not "%ARCH%"=="arm64" (
    echo [ERROR] Arch must be amd64 or arm64
    call :show_help
    exit /b 1
)

set "IMAGE_TAG=%REGISTRY%/%NAMESPACE%/%IMAGE_NAME%:%VERSION%"

echo [build-push] type=%IMAGE_TYPE% version=%VERSION% arch=%ARCH%
echo [build-push] tag=%IMAGE_TAG%
echo.
echo Dockerfile=%DOCKERFILE%  context=%BUILD_CTX%
echo.

if not exist "%DOCKERFILE%" (
    echo [ERROR] Missing file: %DOCKERFILE%
    exit /b 1
)
if not exist "%BUILD_CTX%" (
    echo [ERROR] Missing build context: %BUILD_CTX%
    exit /b 1
)

echo [INFO] docker login %REGISTRY%  (if push fails^)
echo [INFO] buildx --load then docker push
echo.

REM WRONG: --load=path  (load is a flag; context is the last argument^)
docker buildx build --platform=linux/%ARCH% --tag="%IMAGE_TAG%" --file="%DOCKERFILE%" --load "%BUILD_CTX%"
if errorlevel 1 (
    echo [ERROR] docker build failed
    exit /b 1
)

docker images | findstr /i "%IMAGE_NAME%" | findstr /i "%VERSION%"

docker push "%IMAGE_TAG%"
if errorlevel 1 (
    echo [ERROR] docker push failed
    exit /b 1
)

echo [SUCCESS] %IMAGE_TAG%
exit /b 0

:show_help
echo Usage: %~nx0 ^<backend^|worker^|frontend^> ^<version^> [amd64^|arm64]
echo Default arch: %DEFAULT_ARCH%
echo Registry: %REGISTRY%/%NAMESPACE%/  agentarena-backend, agentarena-worker, agentarena-frontend
echo Can run from any directory; script cds to its own folder.
goto :eof
