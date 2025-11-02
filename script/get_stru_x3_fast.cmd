@echo off
chcp 65001 >nul
echo 正在快速导出项目结构...
echo.

set output=project_structure.txt

echo ======================================== > %output%
echo 项目目录结构（精简版） >> %output%
echo 生成时间: %date% %time% >> %output%
echo 项目路径: %CD% >> %output%
echo ======================================== >> %output%
echo. >> %output%

echo [根目录文件] >> %output%
dir /b >> %output% 2>nul
echo. >> %output%

:: 只扫描常见的源代码目录
echo [src 目录] >> %output%
if exist "src" (
    dir /s /b src\*.py src\*.ts src\*.tsx src\*.jsx src\*.js 2>nul >> %output%
) else (
    echo （不存在） >> %output%
)
echo. >> %output%

echo [backend 目录] >> %output%
if exist "backend" (
    dir /s /b backend\*.py 2>nul >> %output%
) else (
    echo （不存在） >> %output%
)
echo. >> %output%

echo [frontend 目录] >> %output%
if exist "frontend" (
    dir /s /b frontend\*.ts frontend\*.tsx frontend\*.jsx frontend\*.js 2>nul | findstr /v /i "node_modules" >> %output%
) else (
    echo （不存在） >> %output%
)
echo. >> %output%

echo [components 目录] >> %output%
if exist "components" (
    dir /s /b components\*.tsx components\*.jsx 2>nul >> %output%
) else (
    echo （不存在） >> %output%
)
echo. >> %output%

echo [mods 目录（YAML 模型）] >> %output%
if exist "mods" (
    dir /s /b mods\*.yaml mods\*.yml 2>nul >> %output%
) else (
    echo （不存在） >> %output%
)
echo. >> %output%

echo [配置文件] >> %output%
dir /b *.json *.yaml *.yml *.md *.txt *.toml *.ini 2>nul >> %output%
echo. >> %output%

echo ======================================== >> %output%

:: 统计文件数
echo. >> %output%
echo [文件统计] >> %output%
for %%x in (py ts tsx jsx js yaml yml json md) do (
    for /f %%c in ('dir /s /b *.%%x 2^>nul ^| findstr /v /i "node_modules .git" ^| find /c /v ""') do (
        echo %%x 文件: %%c 个 >> %output%
    )
)

echo. >> %output%
echo ======================================== >> %output%
echo 导出完成！ >> %output%

type %output%
echo.
echo.
echo ✓ 已生成 %output%
echo.
pause