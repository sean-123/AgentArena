@echo off
chcp 936 > nul
setlocal enabledelayedexpansion

REM Docker 镜像构建和推送脚本 (Windows)
REM 使用方法: build-push.bat <镜像类型> <版本号> [架构]
REM 镜像类型: backend | worker | frontend
REM 版本号: 必填，如 v1.0.1
REM 架构: amd64|arm64 (默认: amd64)
REM
REM 请从 AgentArena/docker 目录运行此脚本

REM 配置变量 - 请根据实际阿里云仓库修改
set REGISTRY=ps-docker-registry.cn-beijing.cr.aliyuncs.com
set NAMESPACE=psdsframework
set DEFAULT_ARCH=amd64

REM 检查参数
if "%~1"=="" (
    echo [ERROR] 缺少镜像类型参数
    echo.
    call :show_help
    exit /b 1
)
if "%~2"=="" (
    echo [ERROR] 缺少版本号参数
    echo.
    call :show_help
    exit /b 1
)

REM 解析参数
set IMAGE_TYPE=%~1
set VERSION=%~2
set ARCH=%~3
if "%ARCH%"=="" set ARCH=%DEFAULT_ARCH%

REM 根据镜像类型设置 Dockerfile 和 context
if "%IMAGE_TYPE%"=="backend" (
    set IMAGE_NAME=agentarena-backend
    set DOCKERFILE=Dockerfile.backend
    set BUILD_CTXT=..\backend
) else if "%IMAGE_TYPE%"=="worker" (
    set IMAGE_NAME=agentarena-worker
    set DOCKERFILE=Dockerfile.worker
    set BUILD_CTXT=..
) else if "%IMAGE_TYPE%"=="frontend" (
    set IMAGE_NAME=agentarena-frontend
    set DOCKERFILE=Dockerfile.frontend
    set BUILD_CTXT=..\frontend
) else (
    echo [ERROR] 镜像类型必须是 'backend'、'worker' 或 'frontend'
    call :show_help
    exit /b 1
)

REM 验证架构参数
if not "%ARCH%"=="amd64" if not "%ARCH%"=="arm64" (
    echo [ERROR] 架构参数必须是 'amd64' 或 'arm64'
    call :show_help
    exit /b 1
)

REM 构建镜像标签
set IMAGE_TAG=%REGISTRY%/%NAMESPACE%/%IMAGE_NAME%:%VERSION%

echo ==========================================
echo Docker 镜像构建和推送配置
echo ==========================================
echo 镜像类型: %IMAGE_TYPE%
echo 版本: %VERSION%
echo 架构: %ARCH%
echo 镜像标签: %IMAGE_TAG%
echo Dockerfile: %DOCKERFILE%
echo 构建上下文: %BUILD_CTXT%
echo ==========================================

REM 检查 Dockerfile 是否存在
if not exist "%DOCKERFILE%" (
    echo [ERROR] Dockerfile 不存在: %DOCKERFILE%
    echo [INFO] 请确保在 AgentArena/docker 目录下运行此脚本
    exit /b 1
)

REM 检查构建上下文
if not exist "%BUILD_CTXT%" (
    echo [ERROR] 构建上下文不存在: %BUILD_CTXT%
    echo [INFO] 请确保在 AgentArena/docker 目录下运行此脚本
    exit /b 1
)

REM 提示登录信息
echo [INFO] 注意: 如果推送失败，请先登录到阿里云容器镜像服务:
echo docker login %REGISTRY%

REM 构建镜像
echo [INFO] 开始构建 Docker 镜像...
echo [INFO] 目标架构: %ARCH%
echo [INFO] 使用 buildx 构建...

docker buildx build --platform linux/%ARCH% --tag %IMAGE_TAG% --file %DOCKERFILE% --load %BUILD_CTXT%
if errorlevel 1 (
    echo [ERROR] 镜像构建失败
    exit /b 1
)
echo [SUCCESS] 镜像构建成功: %IMAGE_TAG%

REM 显示镜像信息
echo [INFO] 镜像信息:
docker images | findstr "%IMAGE_NAME%" | findstr "%VERSION%"

REM 推送镜像
echo [INFO] 开始推送镜像到阿里云容器镜像服务...
docker push %IMAGE_TAG%
if errorlevel 1 (
    echo [ERROR] 镜像推送失败
    echo [INFO] 请检查: 1^) 是否已执行 docker login %REGISTRY%  2^) 是否有推送权限
    exit /b 1
)
echo [SUCCESS] 镜像推送成功: %IMAGE_TAG%

echo ==========================================
echo [SUCCESS] 构建和推送完成!
echo [SUCCESS] 镜像: %IMAGE_TAG%
echo [SUCCESS] 架构: %ARCH%
echo ==========================================

REM 提供使用建议
echo [INFO] 使用建议:
echo [INFO] 拉取镜像: docker pull %IMAGE_TAG%
echo [INFO] 运行容器: docker run -p 8000:8000 %IMAGE_TAG%

exit /b 0

:show_help
echo Docker 镜像构建和推送脚本 - AgentArena
echo.
echo 使用方法:
echo   %~nx0 ^<镜像类型^> ^<版本号^> [架构]
echo.
echo 参数:
echo   镜像类型  必填，backend ^| worker ^| frontend
echo   版本号    必填，镜像版本标签，如: v1.0.1, 1.0.1, latest
echo   架构      可选，amd64 ^| arm64 (默认: amd64)
echo.
echo 示例:
echo   %~nx0 backend v1.0.1
echo   %~nx0 worker v1.0.1 amd64
echo   %~nx0 frontend v1.0.1 arm64
echo   %~nx0 backend latest
echo.
echo 镜像仓库: %REGISTRY%/%NAMESPACE%/
echo   - agentarena-backend
echo   - agentarena-worker
echo   - agentarena-frontend
echo.
echo 请在 AgentArena/docker 目录下运行此脚本
goto :eof
