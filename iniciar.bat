@echo off
REM ============================================================
REM  iniciar.bat - Inicia o servidor com um clique
REM ============================================================
title Servidor - Sistema de Login
set NODE_PATH=C:\Program Files\nodejs
set PATH=%NODE_PATH%;%PATH%

cd /d "%~dp0server"

echo.
echo  ============================================
echo   Iniciando o servidor...
echo   Acesse: http://localhost:3000
echo   (Para parar, feche esta janela)
echo  ============================================
echo.

node server.js
REM ----- 
echo.
echo  ============================================
echo   O servidor foi encerrado ou deu erro acima.
echo.
echo   Se aparecer "EADDRINUSE" ou "address already",
echo   significa que JA existe um servidor rodando.
echo   Nesse caso, apenas abra http://localhost:3000

echo   e NAO precisa abrir outra janela.
echo  ============================================
echo.
pause
