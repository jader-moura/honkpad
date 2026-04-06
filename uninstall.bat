@echo off
REM Uninstall script for Honkpad
echo Uninstalling Honkpad...

REM Kill any running Honkpad processes
taskkill /IM "Honkpad.exe" /F 2>nul
taskkill /IM "Honkpad 1.0.0.exe" /F 2>nul
timeout /t 2

REM Remove from Program Files
if exist "%ProgramFiles%\Honkpad" (
    echo Removing from Program Files...
    rmdir /s /q "%ProgramFiles%\Honkpad"
)

REM Remove from AppData
if exist "%APPDATA%\Honkpad" (
    echo Removing AppData...
    rmdir /s /q "%APPDATA%\Honkpad"
)

REM Remove Start Menu shortcuts
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Honkpad" (
    rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Honkpad"
)

REM Remove Desktop shortcut
if exist "%USERPROFILE%\Desktop\Honkpad.lnk" (
    del "%USERPROFILE%\Desktop\Honkpad.lnk"
)

echo Honkpad has been uninstalled.
echo.
pause
