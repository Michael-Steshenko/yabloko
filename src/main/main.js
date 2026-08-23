const { app, BrowserWindow, shell, components } = require('electron');
const { createServer } = require('./http-server');

const PORT = Number(process.env.YABLOKO_PORT) || 8787;
const HOST = process.env.YABLOKO_HOST || '127.0.0.1';
const ALLOWED_NAVIGATION_HOST = /(^|\.)apple\.com$/;

let mainWindow = null;
let server = null;
let isQuitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    await components.whenReady();

    app.userAgentFallback = app.userAgentFallback
      .replace(/\s*Electron\/\S+/, '')
      .replace(/\s*yabloko\/\S+/, '');

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!ALLOWED_NAVIGATION_HOST.test(new URL(url).hostname)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    mainWindow.on('close', (event) => {
      if (isQuitting) return;
      event.preventDefault();
      mainWindow.hide();
    });

    await mainWindow.loadURL('https://music.apple.com');

    server = createServer({
      host: HOST,
      port: PORT,
      getWebContents: () => (mainWindow ? mainWindow.webContents : null),
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`yabloko: port ${PORT} is already in use, quitting`);
        app.quit();
        return;
      }
      console.error('yabloko: control server error', err);
    });
    server.listen(PORT, HOST);
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (server) server.close();
  });
}
