# 异色保底计数器

洛克王国异色保底计数工具

## 功能介绍

这是一个Electron应用，用于帮助洛克王国游戏中的异色精灵捕捉计数。

## 使用说明

### 开发模式
```bash
npm install
npm run dev
```

### 打包
```bash
npm run build:win
```

## 项目结构

```
ROCO KINGDOM/
├── src/
│   ├── main/          # 主进程
│   │   ├── main.js
│   │   └── preload.js
│   └── renderer/      # 渲染进程
│       ├── index.html
│       └── recognizer.worker.js
├── build/           # 构建资源
└── electron-builder.yml
```

## 作者

NanxunZzzzz
