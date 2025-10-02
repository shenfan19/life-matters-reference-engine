@echo off
cls
setlocal enabledelayedexpansion

:: ----------------------------------------------------------------------
:: 配置和初始化
:: ----------------------------------------------------------------------

:: 设置项目根目录和输出目录
set "PROJECT_DIR=%CD%"

:: 兼容性更好的时间戳生成方式
set "DATE_STR=%date%"
:: 适配多种日期格式（如 Wed 10/01/2025 或 2025/10/01）
if "%DATE_STR:~2,1%"==" " set "DATE_STR=%DATE_STR:~4,10%"
if "%DATE_STR:~0,3%"=="星期" set "DATE_STR=%DATE_STR:~4,10%"
set "DATE_STR=%DATE_STR:/=-%"
set "TIME_STR=%time::=-%"
set "TIMESTAMP=%DATE_STR%_%TIME_STR:~0,8%"

set "TEST_DATA_DIR=%PROJECT_DIR%\mods\test"
set "LOGF_DIR=%PROJECT_DIR%\users\test"
set "LOGF=%LOGF_DIR%\test_%TIMESTAMP%.txt"

if not exist "%LOGF_DIR%" mkdir "%LOGF_DIR%"

:: 初始化输出文件
echo 当前目录: %PROJECT_DIR% > "%LOGF%"
echo === 开始 Loader CLI 测试 (%TIMESTAMP%) === >> "%LOGF%"

call :RUNN

:: ----------------------------------------------------------------------
:: 测试命令定义
:: ----------------------------------------------------------------------

:: file
python src\loader_cli.py --file test\test >>%LOGF% & call :RUNN
python src\loader_cli.py --file test\test.yaml >>%LOGF% & call :RUNN
python src\loader_cli.py --file test\nonexistent >>%LOGF% & call :RUNN
python src\loader_cli.py --file test nonexistent >>%LOGF% & call :RUNN
python src\loader_cli.py --file test.yaml nonexistent >>%LOGF% & call :RUNN

:: file merge model
python src\loader_cli.py --folder physiology --merge-to merged.yaml >>%LOGF% & call :RUNN
python src\loader_cli.py --file %TEST_DATA_DIR%\cyclic_model.yaml >>%LOGF% & call :RUNN

:: file split
python src\loader_cli.py --file merged.yaml --split-to merged >>%LOGF% & call :RUNN
python src\loader_cli.py --file %TEST_DATA_DIR%\complex_model.yaml >>%LOGF% & call :RUNN

:: file list
@REM python src\loader_cli.py --list --file physiology\obesity_diabetes.yaml >>%LOGF% & call :RUNN

@REM :: optional folder
@REM python src\loader_cli.py --folder physiology >>%LOGF% & call :RUNN
@REM python src\loader_cli.py --folder nonexistent >>%LOGF% & call :RUNN
@REM python src\loader_cli.py --folder physiology nonexistent >>%LOGF% & call :RUNN

:: folder merge
@REM python src\loader_cli.py --folder physiology >>%LOGF% & call :RUNN
@REM python src\loader_cli.py --folder physiology --merge-to aaa >>%LOGF% & call :RUNN
@REM python src\loader_cli.py --folder nonexistent --split-to bbb >>%LOGF% & call :RUNN

:: folder split

:: folder list
@REM python src\loader_cli.py --list --folder physiology >>%LOGF% & call :RUNN

:: all list
@REM python src\loader_cli.py --list >>%LOGF% & call :RUNN

:RUNN
    echo. >> "%LOGF%"
    echo ---------------------------------------------------- >> "%LOGF%"
    echo 第1节 >> "%LOGF%"
    echo ---------------------------------------------------- >> "%LOGF%"
    echo. >> "%LOGF%"
