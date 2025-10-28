@echo off
cls

del mods\merged\*.yaml
echo merged folder wiped.

del mods\patch\*.yaml
echo patch folder wiped.

@REM del mods\splited\*.yaml /s
rd mods\splited /S /Q && md mods\splited
echo split folder wiped.

set "CLI=python src\loader\loader_cli.py"
set "MODS_DIR=test"

echo.
echo ==== 测试 1: Validate - 测试通过的版本 ====
%CLI% --file %MODS_DIR%\test_valid.yaml

echo.
echo ==== 测试 2: Validate - 测试不通过，生成 patch ====
%CLI% --file %MODS_DIR%\test_invalid.yaml

echo.
echo ==== 测试 3: Merge - 合并 invalid 和 patch ====
%CLI% --file %MODS_DIR%\test_invalid.yaml %MODS_DIR%\test_invalid_patch.yaml --merge-to test_patched.yaml

echo.
echo ==== 测试 4: Merge - 合并两个独立模块 ====
%CLI% --file %MODS_DIR%\test_module1.yaml %MODS_DIR%\test_module2.yaml --merge-to test_combined.yaml

echo.
echo ==== 测试 5: Split - 分割大模型 ====
%CLI% --file %MODS_DIR%\test_split_large.yaml --split-to test_split_large
