@echo off
echo.
echo Removendo arquivo de bloqueio do Git...
del /f "%~dp0.git\index.lock" 2>nul
echo.
echo Publicando alteracoes...
cd /d "%~dp0"
git config user.email "daiannalana@gmail.com"
git config user.name "Daianna"
git add src/navigation.ts src/assets/styles/tailwind.css src/components/widgets/Header.astro src/pages/index.astro publicar-site.bat
git commit -m "Menu: botao WhatsApp verde e remove link duplicado"
git push
echo.
echo ========================================
echo Pronto! Acesse em 1-2 minutos:
echo https://astrowind-olive-two.vercel.app
echo ========================================
pause
