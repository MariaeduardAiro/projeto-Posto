@echo off
REM ============================================================
REM  iniciar.bat - Inicia o servidor com um clique (SOMENTE NO SEU PC)
REM ------------------------------------------------------------
REM  Este arquivo serve apenas para testar o sistema no seu
REM  computador. NAO e usado na hospedagem (site publicado).
REM  Para publicar na internet, veja o arquivo GUIA-DEPLOY.md
REM ============================================================
title Servidor - Sistema de Login
set NODE_PATH=C:\Program Files\nodejs
set PATH=%NODE_PATH%;%PATH%

cd /d "%~dp0server"

REM ---- Localiza o node.exe (PATH do sistema ou instalacao padrao) ----
set NODE_EXE=
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_EXE set NODE_EXE=%%i
if not defined NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set NODE_EXE=C:\Program Files\nodejs\node.exe
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe
if not defined NODE_EXE (
  echo  ERRO: O Node.js nao foi encontrado neste computador.
  echo  Instale em: https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo   Iniciando o servidor...
echo   Acesse: http://localhost:3000
echo   (Para parar, feche esta janela)
echo  ============================================
echo.

:reiniciar
"%NODE_EXE%" server.js >> "%~dp0server\server-out.log" 2>> "%~dp0server\server-err.log"
set EXIT_CODE=%ERRORLEVEL%

echo.
echo  ============================================
echo   O servidor foi encerrado (codigo %EXIT_CODE%).
echo   Nova tentativa em 3 segundos.
echo   Para encerrar de vez, feche esta janela.
echo  ============================================
echo.
timeout /t 3 /nobreak >nul
goto reiniciar
