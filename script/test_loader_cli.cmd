@echo off
:: script\test_loader.cmd
:: 创建时间：2025-10-01
:: 修改时间：2025-10-01
:: 修改原因：简化脚本，生成单一输出文件，包含所有测试的返回信息，保存到 users\test\YYYY-MM-DD_hh-mm-ss
:: 用途：逐行运行 loader_cli 测试命令，输出到一个文件，测试间加分隔符
:: 运行：script\test_loader.cmd

:: 设置项目根目录和输出目录
set "PROJECT_DIR=%CD%"
set "TEST_DATA_DIR=%PROJECT_DIR%\mods\test"
:: 生成时间戳（YYYY-MM-DD_hh-mm-ss）
set "DATE_STR=%date%"
:: 适配多种日期格式（如 Wed 10/01/2025 或 2025/10/01）
if "%DATE_STR:~2,1%"==" " set "DATE_STR=%DATE_STR:~4,10%"
if "%DATE_STR:~0,3%"=="星期" set "DATE_STR=%DATE_STR:~4,10%"
set "DATE_STR=%DATE_STR:/=-%"
set "TIME_STR=%time::=-%"
set "TIMESTAMP=%DATE_STR%_%TIME_STR:~0,8%"
set "OUTPUT_DIR=%PROJECT_DIR%\users\test"
set "OUTPUT_FILE=%OUTPUT_DIR%\test_%TIMESTAMP%.txt"
:: 创建输出目录
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

:: 初始化输出文件
echo 当前目录: %PROJECT_DIR% > "%OUTPUT_FILE%"
echo === 开始 Loader CLI 测试 === >> "%OUTPUT_FILE%"
echo Initial done

:: 测试用例
:: 测试 1: --list 有效文件夹
echo Test 1: List models in physiology >> "%OUTPUT_FILE%"
set "cmd_line=python src\loader_cli.py --list --folder physiology"
echo %cmd_line% >> "%OUTPUT_FILE%"
%cmd_line% >> "%OUTPUT_FILE%" 2>&1
echo Exit code: %errorlevel% >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo Test 1 done

:: 测试 2: --list 无效文件夹
echo Test 2: List nonexistent folder >> "%OUTPUT_FILE%"
set "cmd_line=python src\loader_cli.py --list --folder nonexistent"
echo %cmd_line% >> "%OUTPUT_FILE%"
%cmd_line% >> "%OUTPUT_FILE%" 2>&1
echo Exit code: %errorlevel% >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo Test 2 done

:: 测试 3: --file 有效文件
echo Test 3: Load valid file >> "%OUTPUT_FILE%"
set "cmd_line=python src\loader_cli.py --file physiology\obesity_diabetes.yaml"
echo %cmd_line% >> "%OUTPUT_FILE%"
%cmd_line% >> "%OUTPUT_FILE%" 2>&1
echo Exit code: %errorlevel% >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo Test 3 done

:: 测试 4: --file 无效文件
echo Test 4: Load invalid file >> "%OUTPUT_FILE%"
set "cmd_line=python src\loader_cli.py --file nonexistent.yaml"
echo %cmd_line% >> "%OUTPUT_FILE%"
%cmd_line% >> "%OUTPUT_FILE%" 2>&1
echo Exit code: %errorlevel% >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo Test 4 done

:: 测试 5: --merge-to 合并模型
echo Test 5: Merge models >> "%OUTPUT_FILE%"
set "cmd_line=python src\loader_cli.py --folder physiology --merge-to merged_%TIMESTAMP%.yaml"
echo %cmd_line% >> "%OUTPUT_FILE%" 2>&1
echo "Exit code: %errorlevel%" >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo Test 5 done

:: 测试 6: --split-to 拆分模型
echo Test 6: Split model >> "%OUTPUT_FILE%"
set "cmd_line=python src\loader_cli.py --file %TEST_DATA_DIR%\complex_model.yaml"
echo %cmd_line% >> "%OUTPUT_FILE%"
%cmd_line% >> "%OUTPUT_FILE%" 2>&1
echo "Exit code: %errorlevel%" >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo Test 6 done

:: 测试 7: 循环依赖
echo Test 7: Detect cyclic dependency >> "%OUTPUT_FILE%"
set "cmd_line=python src\loader_cli.py --file %TEST_DATA_DIR%\cyclic_model.yaml"
echo %cmd_line% >> "%OUTPUT_FILE%"
%cmd_line% >> "%OUTPUT_FILE%" 2>&1
echo "Exit code: %errorlevel%" >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo. >> "%OUTPUT_FILE%"
echo Test 7 done

:: 总结
echo === 测试完成 === >> "%OUTPUT_FILE%"
echo 输出保存至: %OUTPUT_FILE% >> "%OUTPUT_FILE%"
echo 请检查 %OUTPUT_FILE% 和生成文件（如 merged_%TIMESTAMP%.yaml） >> "%OUTPUT_FILE%"

:: 显示总结
echo === 测试完成 ===
echo 输出保存至: %OUTPUT_FILE%
echo 请检查 %OUTPUT_FILE% 和生成文件
