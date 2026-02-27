@echo off
set BASE_DIR=%~dp0..
cd /d %BASE_DIR%\locales

echo Creating zh_CN...
if not exist zh_CN mkdir zh_CN
if not exist zh_CN\LC_MESSAGES mkdir zh_CN\LC_MESSAGES
copy /Y zhhans\LC_MESSAGES\messages.po zh_CN\LC_MESSAGES\messages.po

echo Creating zh_TW...
if not exist zh_TW mkdir zh_TW
if not exist zh_TW\LC_MESSAGES mkdir zh_TW\LC_MESSAGES
copy /Y zhhant\LC_MESSAGES\messages.po zh_TW\LC_MESSAGES\messages.po

echo Directory setup complete.
