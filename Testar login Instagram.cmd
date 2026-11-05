@echo off
set "CIRCULO_RUNTIME=%LOCALAPPDATA%\Circulo\python"
if not exist "%CIRCULO_RUNTIME%\Scripts\python.exe" python -m venv "%CIRCULO_RUNTIME%"
if errorlevel 1 goto erro
"%CIRCULO_RUNTIME%\Scripts\python.exe" -c "import instagrapi" >nul 2>&1
if errorlevel 1 "%CIRCULO_RUNTIME%\Scripts\python.exe" -m pip install -r "%~dp0testar-instagrapi-requirements.txt"
if errorlevel 1 goto erro
"%CIRCULO_RUNTIME%\Scripts\python.exe" "%~dp0instagrapi_login.py" --open
if errorlevel 1 goto erro
exit /b
:erro
echo Nao foi possivel abrir o teste de login. Confira a instalacao do Python.
pause
