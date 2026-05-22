const { app, BrowserWindow, ipcMain, screen, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, execFile } = require('child_process');
const Tesseract = require('tesseract.js');

let mainWindow;
let selectionWindow = null;

const templateDir = path.join(app.getPath('userData'), 'templates');
const isPackaged = app.isPackaged;
const appRoot = isPackaged ? path.dirname(app.getPath('exe')) : __dirname + '/..';

// 设置 AppUserModelID 确保任务栏图标正确
if (process.platform === 'win32') {
    app.setAppUserModelId('com.yuguxiaojiu.roco-pity-tracker');
}

function ensureTemplateDir() {
    if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
    }
}

function copyDefaultTemplates() {
    ensureTemplateDir();
    
    const existingFiles = fs.readdirSync(templateDir);
    if (existingFiles.length > 0) return;

    let sourceTemplateDir;
    if (isPackaged) {
        sourceTemplateDir = path.join(process.resourcesPath, 'templates');
    } else {
        sourceTemplateDir = path.join(__dirname, '..', 'demo-images');
    }

    if (!fs.existsSync(sourceTemplateDir)) {
        console.log('模板源目录不存在:', sourceTemplateDir);
        return;
    }

    try {
        const files = fs.readdirSync(sourceTemplateDir);
        const imageFiles = files.filter(f => /\.(png|jpg|jpeg|bmp)$/i.test(f));
        
        imageFiles.forEach(file => {
            const srcPath = path.join(sourceTemplateDir, file);
            const destPath = path.join(templateDir, file);
            fs.copyFileSync(srcPath, destPath);
            console.log('已复制模板:', file);
        });
        
        console.log(`已复制 ${imageFiles.length} 个默认模板`);
    } catch (err) {
        console.error('复制默认模板失败:', err.message);
    }
}

function createWindow() {
    const iconPath = path.join(__dirname, '../../build/icon.ico');
    const windowOptions = {
        width: 900,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        title: 'YUGUXIAOJIU - 异色保底计数',
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    };
    
    console.log('[DEBUG] 图标路径:', iconPath);
    console.log('[DEBUG] 图标文件是否存在:', fs.existsSync(iconPath));

    mainWindow = new BrowserWindow(windowOptions);

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (selectionWindow) {
            selectionWindow.close();
            selectionWindow = null;
        }
    });
    
    ensureTemplateDir();
}

function createSelectionWindow(targetWindow = null) {
    let targetDisplay = screen.getPrimaryDisplay();
    let targetBounds = targetDisplay.workArea;
    
    if (targetWindow && targetWindow.x !== undefined && targetWindow.y !== undefined) {
        const displays = screen.getAllDisplays();
        for (const display of displays) {
            const bounds = display.workArea;
            if (targetWindow.x >= bounds.x && targetWindow.x < bounds.x + bounds.width &&
                targetWindow.y >= bounds.y && targetWindow.y < bounds.y + bounds.height) {
                targetDisplay = display;
                targetBounds = bounds;
                break;
            }
        }
    }
    
    selectionWindow = new BrowserWindow({
        width: targetBounds.width,
        height: targetBounds.height,
        x: targetBounds.x,
        y: targetBounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: true,
        hasShadow: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    selectionWindow.loadFile(path.join(__dirname, '../renderer/selection.html'));
    
    setTimeout(() => {
        if (selectionWindow) {
            selectionWindow.focus();
        }
    }, 100);

    selectionWindow.on('closed', () => {
        selectionWindow = null;
    });
}

let regionEditorWindow = null;
let pendingRegionsData = null;

function createRegionEditorWindow(regions, windowInfo) {
    let targetDisplay = screen.getPrimaryDisplay();
    let targetBounds = targetDisplay.workArea;
    
    let editorX = 0;
    let editorY = 0;
    
    if (windowInfo && windowInfo.x !== undefined && windowInfo.y !== undefined) {
        const displays = screen.getAllDisplays();
        for (const display of displays) {
            const bounds = display.workArea;
            if (windowInfo.x >= bounds.x && windowInfo.x < bounds.x + bounds.width &&
                windowInfo.y >= bounds.y && windowInfo.y < bounds.y + bounds.height) {
                targetDisplay = display;
                targetBounds = bounds;
                editorX = windowInfo.x;
                editorY = windowInfo.y;
                break;
            }
        }
    }
    
    pendingRegionsData = { regions: regions, windowInfo: windowInfo };
    
    regionEditorWindow = new BrowserWindow({
        width: windowInfo ? windowInfo.width : targetBounds.width,
        height: windowInfo ? windowInfo.height : targetBounds.height,
        x: editorX,
        y: editorY,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: true,
        hasShadow: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    regionEditorWindow.loadFile(path.join(__dirname, '../renderer/region-editor.html'));
    
    setTimeout(() => {
        if (regionEditorWindow) {
            regionEditorWindow.focus();
        }
    }, 100);

    regionEditorWindow.on('closed', () => {
        regionEditorWindow = null;
        pendingRegionsData = null;
    });
}

function getWindowList() {
    return new Promise((resolve) => {
        let scriptPath;
        if (isPackaged) {
            scriptPath = path.join(process.resourcesPath, 'get-windows.ps1');
        } else {
            scriptPath = path.join(__dirname, 'get-windows.ps1');
        }
        
        console.log('PowerShell脚本路径:', scriptPath);
        console.log('脚本是否存在:', fs.existsSync(scriptPath));
        
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, 
            { maxBuffer: 10 * 1024 * 1024, timeout: 10000 }, 
            (error, stdout, stderr) => {
                if (error) {
                    console.error('获取窗口列表失败:', error.message);
                    if (stderr) console.error('stderr:', stderr);
                    resolve([]);
                    return;
                }
                try {
                    const result = JSON.parse(stdout || '[]');
                    const windows = Array.isArray(result) ? result : [result];
                    console.log('获取到窗口数量:', windows.length);
                    resolve(windows);
                } catch (e) {
                    console.error('解析窗口列表失败:', e.message);
                    console.error('原始输出:', stdout ? stdout.substring(0, 500) : '(empty)');
                    resolve([]);
                }
            });
    });
}

let psScriptPath = null;

function ensurePSScript() {
    if (psScriptPath && fs.existsSync(psScriptPath)) {
        return psScriptPath;
    }
    
    const tmpDir = app.getPath('temp');
    psScriptPath = path.join(tmpDir, 'screenshot_capture.ps1');
    
    const psContent = `param([int]$X, [int]$Y, [int]$W, [int]$H)
Add-Type -AssemblyName System.Drawing
$bounds = New-Object System.Drawing.Rectangle($X, $Y, $W, $H)
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[Convert]::ToBase64String($ms.ToArray())
$graphics.Dispose()
$bmp.Dispose()
$ms.Dispose()`;
    
    fs.writeFileSync(psScriptPath, psContent, 'utf8');
    return psScriptPath;
}

function captureRegion(x, y, width, height) {
    return new Promise((resolve) => {
        try {
            const display = screen.getPrimaryDisplay();
            const scaleFactor = display.scaleFactor;
            
            const scaledX = Math.round(x * scaleFactor);
            const scaledY = Math.round(y * scaleFactor);
            const scaledW = Math.round(width * scaleFactor);
            const scaledH = Math.round(height * scaleFactor);

            const psFile = ensurePSScript();

            exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}" -X ${scaledX} -Y ${scaledY} -W ${scaledW} -H ${scaledH}`, 
                { maxBuffer: 50 * 1024 * 1024, timeout: 8000 }, 
                (error, stdout, stderr) => {
                    if (error || !stdout || !stdout.trim()) {
                        resolve(null);
                        return;
                    }
                    resolve({ image: 'data:image/png;base64,' + stdout.trim(), x, y, width, height });
                });

        } catch (e) {
            console.error('区域截图失败:', e.message);
            resolve(null);
        }
    });
}

function getTemplateDir() {
    ensureTemplateDir();
    return templateDir;
}

function getTemplateList() {
    ensureTemplateDir();
    const files = fs.readdirSync(templateDir);
    const templates = files.filter(f => /\.(png|jpg|jpeg|bmp)$/i.test(f)).map(f => ({
        name: path.basename(f, path.extname(f)),
        filename: f,
        path: path.join(templateDir, f),
        data: fs.readFileSync(path.join(templateDir, f)).toString('base64')
    }));
    return templates;
}

ipcMain.handle('get-window-list', async () => {
    return await getWindowList();
});

ipcMain.handle('get-window-info', async (event, hwnd) => {
    try {
        const windows = await getWindowList();
        const targetWindow = windows.find(w => w.hwnd === hwnd);
        if (targetWindow) {
            return { success: true, window: targetWindow };
        }
        return { success: false, error: '窗口未找到' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('capture-region', async (event, region) => {
    return await captureRegion(region.x, region.y, region.width, region.height);
});

ipcMain.handle('get-screen-size', () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
        width: primaryDisplay.workAreaSize.width,
        height: primaryDisplay.workAreaSize.height
    };
});

ipcMain.handle('get-template-dir', () => {
    return getTemplateDir();
});

ipcMain.handle('get-template-list', () => {
    return getTemplateList();
});

ipcMain.handle('open-template-dir', async () => {
    try {
        const dir = getTemplateDir();
        ensureTemplateDir();
        await shell.openPath(dir);
        return { success: true, path: dir };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('start-region-selection', async (event, targetWindow) => {
    return new Promise((resolve) => {
        if (selectionWindow) {
            selectionWindow.close();
            selectionWindow = null;
        }
        
        createSelectionWindow(targetWindow);
        
        ipcMain.once('selection-complete', (event, region) => {
            if (selectionWindow) {
                selectionWindow.close();
                selectionWindow = null;
            }
            resolve(region);
        });
        
        ipcMain.once('selection-cancelled', () => {
            if (selectionWindow) {
                selectionWindow.close();
                selectionWindow = null;
            }
            resolve(null);
        });
    });
});

ipcMain.handle('auto-calculate-regions', async (event, windowInfo) => {
    try {
        if (!windowInfo) {
            return { success: false, error: '窗口信息为空' };
        }
        if (windowInfo.x === undefined || windowInfo.y === undefined) {
            return { success: false, error: '窗口位置信息缺失' };
        }
        if (!windowInfo.width || !windowInfo.height || windowInfo.width < 100 || windowInfo.height < 100) {
            return { success: false, error: '窗口尺寸无效' };
        }

        let { x, y, width, height } = windowInfo;
        
        let contentX = 0;
        let contentY = 0;
        let contentWidth = width;
        let contentHeight = height;
        
        const knownResolutions = [
            { w: 2560, h: 1600 },
            { w: 2560, h: 1440 },
            { w: 1440, h: 900 },
            { w: 1920, h: 1080 },
            { w: 1366, h: 768 },
            { w: 1280, h: 720 }
        ];
        
        for (const res of knownResolutions) {
            const borderWidth = Math.round((width - res.w) / 2);
            const borderHeight = height - res.h;
            if (Math.abs(width - res.w) <= 30 && borderHeight > 20 && borderHeight < 50) {
                contentX = borderWidth;
                contentY = borderHeight;
                contentWidth = res.w;
                contentHeight = res.h;
                break;
            }
        }
        
        let battle1Width, battle1Height, battle1RightMargin, battle1BottomMargin;
        let battle2Width, battle2Height, battle2RightMargin, battle2BottomMargin;
        let peace1Width, peace1Height, peace1RightMargin, peace1TopMargin;
        let peace2Width, peace2Height, peace2RightMargin, peace2TopMargin;
        let avatarWidth, avatarHeight, avatarRightMargin, avatarTopMargin;
        
        if (contentWidth === 2560 && contentHeight === 1600) {
            battle1Width = 43;
            battle1Height = 32;
            battle1RightMargin = 50;
            battle1BottomMargin = 263;
            
            battle2Width = 38;
            battle2Height = 38;
            battle2RightMargin = 55;
            battle2BottomMargin = 179;
            
            peace1Width = 33;
            peace1Height = 31;
            peace1RightMargin = 154;
            peace1TopMargin = 71;
            
            peace2Width = 30;
            peace2Height = 34;
            peace2RightMargin = 97;
            peace2TopMargin = 71;
            
            avatarWidth = 144;
            avatarHeight = 18;
            avatarRightMargin = 46;
            avatarTopMargin = 91;
        } else if (contentWidth === 2560 && contentHeight === 1440) {
            battle1Width = 76;
            battle1Height = 55;
            battle1RightMargin = 77;
            battle1BottomMargin = 400;
            
            battle2Width = 66;
            battle2Height = 64;
            battle2RightMargin = 79;
            battle2BottomMargin = 271;
            
            peace1Width = 58;
            peace1Height = 53;
            peace1RightMargin = 260;
            peace1TopMargin = 56;
            
            peace2Width = 53;
            peace2Height = 58;
            peace2RightMargin = 159;
            peace2TopMargin = 52;
            
            avatarWidth = 254;
            avatarHeight = 31;
            avatarRightMargin = 71;
            avatarTopMargin = 87;
        } else if (contentWidth === 1440 && contentHeight === 900) {
            battle1Width = 35;
            battle1Height = 32;
            battle1RightMargin = 50;
            battle1BottomMargin = 72;
            
            battle2Width = 33;
            battle2Height = 32;
            battle2RightMargin = 55;
            battle2BottomMargin = -10;
            
            peace1Width = 35;
            peace1Height = 32;
            peace1RightMargin = 90;
            peace1TopMargin = 299;
            
            peace2Width = 33;
            peace2Height = 32;
            peace2RightMargin = 28;
            peace2TopMargin = 299;
            
            avatarWidth = 145;
            avatarHeight = 19;
            avatarRightMargin = 13;
            avatarTopMargin = 320;
        } else if (contentWidth === 1400 && contentHeight === 900) {
            battle1Width = 43;
            battle1Height = 31;
            battle1RightMargin = 50;
            battle1BottomMargin = 72;
            
            battle2Width = 35;
            battle2Height = 39;
            battle2RightMargin = 50;
            battle2BottomMargin = -10;
            
            peace1Width = 35;
            peace1Height = 33;
            peace1RightMargin = 90;
            peace1TopMargin = 292;
            
            peace2Width = 30;
            peace2Height = 30;
            peace2RightMargin = 28;
            peace2TopMargin = 293;
            
            avatarWidth = 145;
            avatarHeight = 19;
            avatarRightMargin = 13;
            avatarTopMargin = 313;
        } else {
            const scaleX = contentWidth / 2560;
            const scaleY = contentHeight / 1600;
            
            battle1Width = Math.round(76 * scaleX);
            battle1Height = Math.round(55 * scaleY);
            battle1RightMargin = Math.round(77 * scaleX);
            battle1BottomMargin = Math.round(456 * scaleY);
            
            battle2Width = Math.round(66 * scaleX);
            battle2Height = Math.round(64 * scaleY);
            battle2RightMargin = Math.round(79 * scaleX);
            battle2BottomMargin = Math.round(308 * scaleY);
            
            peace1Width = Math.round(58 * scaleX);
            peace1Height = Math.round(53 * scaleY);
            peace1RightMargin = Math.round(260 * scaleX);
            peace1TopMargin = Math.round(62 * scaleY);
            
            peace2Width = Math.round(53 * scaleX);
            peace2Height = Math.round(58 * scaleY);
            peace2RightMargin = Math.round(159 * scaleX);
            peace2TopMargin = Math.round(58 * scaleY);
            
            avatarWidth = Math.round(254 * scaleX);
            avatarHeight = Math.round(31 * scaleY);
            avatarRightMargin = Math.round(71 * scaleX);
            avatarTopMargin = Math.round(97 * scaleY);
        }

        const regions = {
            battle1: {
                x: Math.round(contentX + contentWidth - battle1RightMargin - battle1Width),
                y: Math.round(contentY + contentHeight - battle1BottomMargin - battle1Height),
                width: battle1Width,
                height: battle1Height,
                screenX: Math.round(x + contentX + contentWidth - battle1RightMargin - battle1Width),
                screenY: Math.round(y + contentY + contentHeight - battle1BottomMargin - battle1Height)
            },
            battle2: {
                x: Math.round(contentX + contentWidth - battle2RightMargin - battle2Width),
                y: Math.round(contentY + contentHeight - battle2BottomMargin - battle2Height),
                width: battle2Width,
                height: battle2Height,
                screenX: Math.round(x + contentX + contentWidth - battle2RightMargin - battle2Width),
                screenY: Math.round(y + contentY + contentHeight - battle2BottomMargin - battle2Height)
            },
            peace1: {
                x: Math.round(contentX + contentWidth - peace1RightMargin - peace1Width),
                y: Math.round(contentY + peace1TopMargin),
                width: peace1Width,
                height: peace1Height,
                screenX: Math.round(x + contentX + contentWidth - peace1RightMargin - peace1Width),
                screenY: Math.round(y + contentY + peace1TopMargin)
            },
            peace2: {
                x: Math.round(contentX + contentWidth - peace2RightMargin - peace2Width),
                y: Math.round(contentY + peace2TopMargin),
                width: peace2Width,
                height: peace2Height,
                screenX: Math.round(x + contentX + contentWidth - peace2RightMargin - peace2Width),
                screenY: Math.round(y + contentY + peace2TopMargin)
            },
            avatar: {
                x: Math.round(contentX + contentWidth - avatarRightMargin - avatarWidth),
                y: Math.round(contentY + avatarTopMargin),
                width: avatarWidth,
                height: avatarHeight,
                screenX: Math.round(x + contentX + contentWidth - avatarRightMargin - avatarWidth),
                screenY: Math.round(y + contentY + avatarTopMargin)
            }
        };

        console.log('[DEBUG] 自动计算区域:', JSON.stringify(regions));
        
        return { success: true, regions: regions };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('open-region-editor', async (event, regions, windowInfo) => {
    return new Promise((resolve) => {
        console.log('[DEBUG] 打开区域编辑器');
        console.log('[DEBUG] 区域数据:', JSON.stringify(regions));
        console.log('[DEBUG] 窗口信息:', JSON.stringify(windowInfo));
        
        if (regionEditorWindow) {
            regionEditorWindow.close();
            regionEditorWindow = null;
        }
        
        pendingRegionsData = { regions: regions, windowInfo: windowInfo };
        
        ipcMain.once('region-editor-ready', () => {
            console.log('[DEBUG] 区域编辑器已准备好，发送数据');
            if (regionEditorWindow && pendingRegionsData) {
                regionEditorWindow.webContents.send('send-regions', pendingRegionsData);
            }
        });
        
        ipcMain.once('regions-confirmed', (event, editedRegions) => {
            if (regionEditorWindow) {
                regionEditorWindow.close();
                regionEditorWindow = null;
            }
            pendingRegionsData = null;
            resolve({ success: true, regions: editedRegions });
        });
        
        ipcMain.once('regions-cancelled', () => {
            if (regionEditorWindow) {
                regionEditorWindow.close();
                regionEditorWindow = null;
            }
            pendingRegionsData = null;
            resolve({ success: false });
        });
        
        createRegionEditorWindow(regions, windowInfo);
    });
});

ipcMain.on('request-regions', (event) => {
    if (pendingRegionsData) {
        event.sender.send('send-regions', pendingRegionsData);
    }
});

ipcMain.on('confirm-regions', (event, regions) => {
    ipcMain.emit('regions-confirmed', null, regions);
});

ipcMain.on('cancel-regions', () => {
    ipcMain.emit('regions-cancelled');
});

ipcMain.on('reset-regions', async (event) => {
    if (pendingRegionsData && pendingRegionsData.windowInfo) {
        const windowInfo = pendingRegionsData.windowInfo;
        if (!windowInfo || windowInfo.x === undefined || windowInfo.y === undefined) {
            return;
        }
        if (!windowInfo.width || !windowInfo.height || windowInfo.width < 100 || windowInfo.height < 100) {
            return;
        }

        const { x, y, width, height } = windowInfo;
        const scale = width / 800;
        
        const newRegions = {
            battle1: {
                x: Math.round(x + width - 160 * scale),
                y: Math.round(y + height - 100 * scale),
                width: Math.round(70 * scale),
                height: Math.round(35 * scale)
            },
            battle2: {
                x: Math.round(x + width - 80 * scale),
                y: Math.round(y + height - 100 * scale),
                width: Math.round(70 * scale),
                height: Math.round(35 * scale)
            },
            peace1: {
                x: Math.round(x + 20 * scale),
                y: Math.round(y + height - 60 * scale),
                width: Math.round(80 * scale),
                height: Math.round(30 * scale)
            },
            peace2: {
                x: Math.round(x + 110 * scale),
                y: Math.round(y + height - 60 * scale),
                width: Math.round(80 * scale),
                height: Math.round(30 * scale)
            },
            avatar: {
                x: Math.round(x + width / 2 - 80 * scale),
                y: Math.round(y + height / 2 - 100 * scale),
                width: Math.round(160 * scale),
                height: Math.round(40 * scale)
            }
        };
        
        pendingRegionsData.regions = newRegions;
        if (regionEditorWindow) {
            regionEditorWindow.webContents.send('send-regions', pendingRegionsData);
        }
    }
});

let ocrWorker = null;

async function getOCRWorker() {
    if (!ocrWorker) {
        ocrWorker = await Tesseract.createWorker('chi_sim+eng', 1, {
            logger: m => { if (m.status === 'recognizing text') console.log('OCR:', Math.round(m.progress * 100) + '%'); }
        });
    }
    return ocrWorker;
}

ipcMain.handle('recognize-text', async (event, imageBase64) => {
    try {
        const worker = await getOCRWorker();
        
        const img = nativeImage.createFromDataURL(imageBase64);
        const buffer = img.toPNG();
        const { createCanvas, loadImage } = require('canvas');
        const canvas = createCanvas(img.getSize().width, img.getSize().height);
        const ctx = canvas.getContext('2d');
        const imgData = await loadImage(buffer);
        ctx.drawImage(imgData, 0, 0);
        
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = pixels.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i+1], b = data[i+2];
            const brightness = (r + g + b) / 3;
            
            if (brightness > 180) {
                const factor = Math.max(0, (brightness - 180) / 75);
                data[i] = Math.round(r * (1 - factor * 0.7));
                data[i+1] = Math.round(g * (1 - factor * 0.7));
                data[i+2] = Math.round(b * (1 - factor * factor * 0.5));
            }
            
            const contrast = 1.4;
            data[i] = Math.min(255, Math.max(0, ((data[i] / 255 - 0.5) * contrast + 0.5) * 255));
            data[i+1] = Math.min(255, Math.max(0, ((data[i+1] / 255 - 0.5) * contrast + 0.5) * 255));
            data[i+2] = Math.min(255, Math.max(0, ((data[i+2] / 255 - 0.5) * contrast + 0.5) * 255));
        }
        
        ctx.putImageData(pixels, 0, 0);
        const processedBase64 = canvas.toDataURL('image/png');
        
        const result = await worker.recognize(processedBase64);
        let text = result.data.text.replace(/[\s\r\n]+/g, '').trim();
        
        text = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9级]/g, '');
        
        return { success: true, text: text, confidence: result.data.confidence };
    } catch (e) {
        console.error('OCR识别失败:', e);
        return { success: false, error: e.message };
    }
});

app.whenReady().then(() => {
    copyDefaultTemplates();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (selectionWindow) {
        selectionWindow.close();
        selectionWindow = null;
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
