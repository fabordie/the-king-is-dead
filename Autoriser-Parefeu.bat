@echo off
title The King is Dead - autorisation du pare-feu
REM Ce script autorise les appareils du reseau local (Wi-Fi) a joindre le jeu.
REM Il doit etre lance par CLIC DROIT puis "Executer en tant qu'administrateur".

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Ce script doit etre lance par clic droit puis
  echo   "Executer en tant qu'administrateur".
  echo.
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="The King is Dead" >nul 2>&1
netsh advfirewall firewall add rule name="The King is Dead" dir=in action=allow protocol=TCP localport=3000-3009

echo.
echo   Regle ajoutee : le jeu (ports 3000 a 3009, et rien d'autre) est
echo   joignable depuis les appareils du meme reseau, y compris via le
echo   Point d'acces mobile de Windows.
echo.
echo   Pour retirer la regle plus tard :
echo   netsh advfirewall firewall delete rule name="The King is Dead"
echo.
pause
