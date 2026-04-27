@echo off
echo.
echo ========================================
echo   Publicando alteracoes do site Triaxis
echo ========================================
echo.

cd /d "%~dp0"

git config user.email "daiannalana@gmail.com"
git config user.name "Daianna"

echo Salvando alteracoes...
git add src/navigation.ts src/assets/styles/tailwind.css src/components/widgets/Header.astro src/pages/index.astro

echo Registrando commit...
git commit -m "Menu: botao WhatsApp verde e remove link duplicado"

echo Enviando para o GitHub...
git push

echo.
echo ========================================
echo   Pronto! O site sera atualizado em
echo   aproximadamente 1 a 2 minutos.
echo   Acesse: https://astrowind-olive-two.vercel.app
echo ========================================
echo.
pause
