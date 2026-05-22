@echo off
echo ====================================
echo     自动推送到GitHub脚本 (SSH)
echo ====================================
echo.

echo [1/6] 初始化Git仓库...
git init
if %errorlevel% neq 0 (
    echo.
    echo ❌ 错误：Git没有安装！
    echo 请先从 https://git-scm.com 下载并安装Git
    echo.
    pause
    exit /b 1
)

echo.
echo [2/6] 配置Git用户信息...
git config user.name "NanxunZzzzz"
git config user.email "1170971132@qq.com"

echo.
echo [3/6] 添加所有文件...
git add .

echo.
echo [4/6] 提交代码...
git commit -m "Initial commit: 异色保底计数器应用"

echo.
echo [5/6] 添加远程仓库 (SSH)...
git remote add origin git@github.com:NanxunZzzzz/Roco.git

echo.
echo [6/6] 推送到GitHub...
git branch -M main
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ✅ 成功推送到GitHub！
) else (
    echo.
    echo ⚠️  推送失败
    echo 请检查：
    echo 1. SSH密钥是否正确配置在GitHub账户中
    echo 2. 网络连接是否正常
    echo 3. 仓库地址是否正确
)

echo.
echo ====================================
pause