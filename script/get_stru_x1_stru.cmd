@echo off
chcp 65001 >nul
echo 正在导出项目结构...
echo.

set output=project_structure.txt

echo ======================================== > %output%
echo 项目目录结构 >> %output%
echo 生成时间: %date% %time% >> %output%
echo ======================================== >> %output%
echo. >> %output%

echo [目录树] >> %output%
echo. >> %output%

:: 使用 tree 命令生成目录树（排除特定目录需要手动处理）
tree /F /A >> %output%

echo. >> %output%
echo ======================================== >> %output%
echo. >> %output%

echo [Python 文件] >> %output%
dir /s /b *.py >> %output% 2>nul
echo. >> %output%

echo [TypeScript/React 文件] >> %output%
dir /s /b *.ts *.tsx *.jsx >> %output% 2>nul
echo. >> %output%

echo [配置文件] >> %output%
dir /s /b *.yaml *.yml *.json >> %output% 2>nul
echo. >> %output%

echo [文档文件] >> %output%
dir /s /b *.md *.txt >> %output% 2>nul
echo. >> %output%

echo ======================================== >> %output%
echo 导出完成！ >> %output%

echo.
echo 完成！请查看 %output%
echo.
pause