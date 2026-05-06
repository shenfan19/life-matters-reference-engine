REM 导出项目结构到 project_structure.txt，排除 node_modules/.git/__pycache__ 等
REM 用途：给 LLM（Claude Code 等）提供项目全貌上下文，粘贴到对话开头
@echo off
chcp 65001 >nul
echo 正在导出项目结构（排除 node_modules 等目录）...
echo.

set output=project_structure.txt

echo ======================================== > %output%
echo 项目目录结构 >> %output%
echo 生成时间: %date% %time% >> %output%
echo ======================================== >> %output%
echo. >> %output%

echo [目录结构] >> %output%
echo. >> %output%

:: 列出所有目录（排除特定目录）
for /f "delims=" %%i in ('dir /s /b /ad ^| findstr /v /i "node_modules .git __pycache__ dist build .vscode .idea venv .venv env"') do (
    echo %%i >> %output%
)

echo. >> %output%
echo ======================================== >> %output%
echo. >> %output%

echo [Python 文件] >> %output%
for /f "delims=" %%i in ('dir /s /b *.py 2^>nul ^| findstr /v /i "node_modules .git __pycache__ venv .venv env"') do (
    echo %%i >> %output%
)
echo. >> %output%

echo [TypeScript/React 文件] >> %output%
for /f "delims=" %%i in ('dir /s /b *.ts *.tsx 2^>nul ^| findstr /v /i "node_modules .git dist build"') do (
    echo %%i >> %output%
)
echo. >> %output%

echo [JavaScript 文件] >> %output%
for /f "delims=" %%i in ('dir /s /b *.js *.jsx 2^>nul ^| findstr /v /i "node_modules .git dist build"') do (
    echo %%i >> %output%
)
echo. >> %output%

echo [YAML 配置文件] >> %output%
for /f "delims=" %%i in ('dir /s /b *.yaml *.yml 2^>nul ^| findstr /v /i "node_modules .git"') do (
    echo %%i >> %output%
)
echo. >> %output%

echo [JSON 配置文件] >> %output%
for /f "delims=" %%i in ('dir /s /b *.json 2^>nul ^| findstr /v /i "node_modules .git dist build"') do (
    echo %%i >> %output%
)
echo. >> %output%

echo [Markdown 文档] >> %output%
for /f "delims=" %%i in ('dir /s /b *.md 2^>nul ^| findstr /v /i "node_modules .git"') do (
    echo %%i >> %output%
)
echo. >> %output%

echo [批处理脚本] >> %output%
for /f "delims=" %%i in ('dir /s /b *.bat *.cmd *.ps1 2^>nul ^| findstr /v /i "node_modules .git"') do (
    echo %%i >> %output%
)
echo. >> %output%

echo ======================================== >> %output%
echo 导出完成！ >> %output%

echo.
echo ✓ 完成！已生成 %output%
echo.
echo 已排除: node_modules, .git, __pycache__, dist, build, venv 等目录
echo.
pause