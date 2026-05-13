@echo off
echo.
echo 🚀 ALPHALEARN - Deployment Preparation Script
echo ==============================================
echo.

echo 📋 Checking required files...
echo.

set MISSING=0

call :check_file "app.py"
call :check_file "database.py"
call :check_file "schema.sql"
call :check_file "requirements.txt"
call :check_file "Procfile"
call :check_file "runtime.txt"
call :check_file "vercel.json"
call :check_file ".gitignore"

echo.
echo 📁 Checking directories...
echo.

if exist "templates\" (
    echo ✅ templates\
    if exist "templates\index.html" (
        echo   ✅ index.html
    ) else (
        echo   ❌ index.html (MISSING)
        set MISSING=1
    )
) else (
    echo ❌ templates\ (MISSING)
    set MISSING=1
)

if exist "data\" (
    echo ✅ data\
    dir /b data\*.txt 2>nul | find /c /v "" > temp.txt
    set /p COUNT=<temp.txt
    del temp.txt
    echo   📄 Found %COUNT% .txt files
) else (
    echo ❌ data\ (MISSING)
    set MISSING=1
)

echo.
echo 🔍 Checking Git status...
echo.

if exist ".git\" (
    echo ✅ Git repository initialized
    git remote -v 2>nul | findstr "origin" >nul
    if %errorlevel% equ 0 (
        echo ✅ Remote repository configured
        git remote -v
    ) else (
        echo ⚠️  No remote repository set
        echo    Run: git remote add origin ^<your-repo-url^>
    )
) else (
    echo ⚠️  Git not initialized
    echo    Run: git init
)

echo.
echo ============================================
echo.

if %MISSING% equ 0 (
    echo ✨ All required files are present!
    echo.
    echo Next steps:
    echo 1. Create a GitHub repository
    echo 2. Push your code:
    echo    git add .
    echo    git commit -m "Deploy"
    echo    git push
    echo 3. Deploy on Render or Vercel (see DEPLOYMENT.md)
) else (
    echo ⚠️  Some files are missing!
    echo Please ensure all required files exist.
)

echo.
echo 📖 For detailed instructions, see:
echo    - DEPLOYMENT.md (quick guide)
echo    - README.md (complete guide)
echo.
pause
exit /b

:check_file
if exist %1 (
    echo ✅ %~1
) else (
    echo ❌ %~1 (MISSING)
    set MISSING=1
)
exit /b
