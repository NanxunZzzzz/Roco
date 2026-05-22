const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    console.log('[TEST] 正在创建窗口...');
    
    const iconPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'icon.ico')
        : path.join(__dirname, '../../build/icon.ico');
    
    console.log('[TEST] 图标路径:', iconPath);
    console.log('[TEST] 图标是否存在:', fs.existsSync(iconPath));
    console.log('[TEST] 图标文件大小:', fs.existsSync(iconPath) ? fs.statSync(iconPath).size + ' bytes' : 'N/A');
    console.log('[TEST] __dirname:', __dirname);
    console.log('[TEST] app.isPackaged:', app.isPackaged);
    console.log('[TEST] process.resourcesPath:', process.resourcesPath);
    
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: '图标测试程序',
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>图标测试</title>
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    padding: 30px; 
                    background: #1e1e1e;
                    color: #f0f0f0;
                }
                .container { max-width: 600px; margin: 0 auto; }
                h1 { color: #4dabf7; }
                .info { background: #2d2d2d; padding: 15px; border-radius: 8px; margin: 15px 0; }
                .success { color: #51cf66; }
                .error { color: #ff6b6b; }
                .label { color: #868e96; display: block; margin-bottom: 5px; }
                .value { font-family: monospace; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔍 图标测试程序</h1>
                
                <div class="info">
                    <span class="label">图标路径:</span>
                    <span class="value">${iconPath}</span>
                </div>
                
                <div class="info">
                    <span class="label">图标文件是否存在:</span>
                    <span class="value ${fs.existsSync(iconPath) ? 'success' : 'error'}">
                        ${fs.existsSync(iconPath) ? '✅ 是' : '❌ 否'}
                    </span>
                </div>
                
                <div class="info">
                    <span class="label">图标文件大小:</span>
                    <span class="value">${fs.existsSync(iconPath) ? (fs.statSync(iconPath).size + ' bytes') : 'N/A'}</span>
                </div>
                
                <div class="info">
                    <span class="label">是否打包模式:</span>
                    <span class="value">${app.isPackaged ? '✅ 是' : '❌ 否'}</span>
                </div>
                
                <div class="info">
                    <span class="label">__dirname:</span>
                    <span class="value">${__dirname}</span>
                </div>
                
                <div class="info">
                    <span class="label">当前目录:</span>
                    <span class="value">${process.cwd()}</span>
                </div>
                
                <div class="info">
                    <span class="label">process.resourcesPath:</span>
                    <span class="value">${process.resourcesPath}</span>
                </div>
                
                <p style="margin-top: 30px;">
                    💡 请查看窗口左上角的图标是否正确显示！
                </p>
                
                <p>
                    💡 如果是在开发模式，请查看任务栏图标是否正确显示！
                </p>
                
                <p>
                    💡 如果打包后，请查看 exe 文件、桌面快捷方式、任务栏图标是否都正确！
                </p>
            </div>
        </body>
        </html>
    `;
    
    mainWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(htmlContent));
    console.log('[TEST] 窗口已创建');
}

app.whenReady().then(() => {
    console.log('[TEST] app 准备就绪');
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
