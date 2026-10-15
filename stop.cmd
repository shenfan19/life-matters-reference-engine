@echo off
REM Stops the LM backend (18080) and GUI (5173, 5174) and the processes they started.
REM Use it when closing the windows did not clean up and a start fails with "port in use".
REM Only a process that LISTENS on a port is stopped, so a browser connected to it is left alone.
REM   stop.cmd           stop the default ports
REM   stop.cmd --list    show what is listening, stop nothing
REM   stop.cmd 18080     stop only the given ports
setlocal enabledelayedexpansion
set "LIST=0"
set "PORTS="
for %%a in (%*) do (
  if /I "%%a"=="--list" (set "LIST=1") else (set "PORTS=!PORTS! %%a")
)
if "%PORTS%"=="" set "PORTS=18080 5173 5174"
set "FOUND=0"
for %%p in (%PORTS%) do (
  for /f "tokens=4,5" %%s in ('netstat -ano -p tcp ^| findstr /C:":%%p "') do (
    if "%%s"=="LISTENING" (
      set "FOUND=1"
      set "NAME=?"
      for /f "tokens=1 delims=," %%n in ('tasklist /FI "PID eq %%t" /FO CSV /NH') do set "NAME=%%~n"
      if "!LIST!"=="1" (
        echo port %%p: !NAME! ^(pid %%t^)
      ) else (
        echo port %%p: stopping !NAME! ^(pid %%t^)
        taskkill /T /F /PID %%t >nul
      )
    )
  )
)
if "%FOUND%"=="0" echo Nothing is listening on%PORTS%.
endlocal
