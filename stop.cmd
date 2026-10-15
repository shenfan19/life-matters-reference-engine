@echo off
REM Stops the LM backend (18080) and GUI (5173, 5174) and the processes they started.
REM Use it when closing the windows did not clean up and a start fails with "port in use".
REM   stop.cmd           stop the default ports
REM   stop.cmd --list    show what is listening, stop nothing
REM   stop.cmd 18080     stop only the given ports
python "%~dp0scripts\kill_ports.py" %*
