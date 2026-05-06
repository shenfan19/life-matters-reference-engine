REM 递归删除项目下所有 __pycache__ 文件夹，Python 重新导入时会自动重建
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
