REM 将 locales/ 下所有 .po 文件编译成 .mo（gettext 二进制格式）
REM 修改翻译后需运行此脚本，Python 后端才能读取更新后的翻译
pybabel compile -d locales
