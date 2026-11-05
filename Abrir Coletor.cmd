@echo off
set "CIRCULO_RUNTIME=%LOCALAPPDATA%\Circulo\python"
if not exist "%CIRCULO_RUNTIME%\Scripts\python.exe" python -m venv "%CIRCULO_RUNTIME%"
if errorlevel 1 goto erro
"%CIRCULO_RUNTIME%\Scripts\python.exe" -c "import playwright" >nul 2>&1
if errorlevel 1 "%CIRCULO_RUNTIME%\Scripts\python.exe" -m pip install -r "%~dp0coletor-requirements.txt"
if errorlevel 1 goto erro
start "" "%CIRCULO_RUNTIME%\Scripts\pythonw.exe" "%~dp0coletor_local.py" %*
exit /b
:erro
echo Nao foi possivel preparar o coletor. Confira se Python e Google Chrome estao instalados.
pause
