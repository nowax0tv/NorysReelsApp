// ============================================================
//  Norys Reels — Electron main process
//  Lance server.js (backend Express/HTTP sur le port 3333) avec
//  le Node embarqué dans Electron, puis affiche l'UI dans une
//  fenêtre sans chrome de navigateur.
// ============================================================

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const treeKill = require('tree-kill');

const PORT = 3333;
const SERVER_URL = `http://localhost:${PORT}`;

let serverProcess = null;
let mainWindow = null;

function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: __dirname,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NORYS_ELECTRON: '1' },
    stdio: 'inherit',
    windowsHide: true,
  });
  serverProcess.on('exit', (code) => {
    console.log('[Norys Reels] serveur arrêté (code ' + code + ')');
  });
}

// serverProcess.kill() ne tue QUE server.js — pas FFmpeg, que server.js lance
// lui-même comme processus enfant. Sur Windows en particulier, tuer un
// processus ne tue jamais ses propres enfants automatiquement : si une
// génération est en cours quand on ferme l'app, FFmpeg continuait de
// tourner en arrière-plan, invisible, après la fermeture de la fenêtre.
// tree-kill tue tout l'arbre de processus (server.js + FFmpeg en cours).
function killServerTree() {
  if (!serverProcess || serverProcess.pid == null) return;
  treeKill(serverProcess.pid, 'SIGKILL', (err) => {
    if (err) console.error('[Norys Reels] tree-kill error:', err.message);
  });
  serverProcess = null;
}

function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(SERVER_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Le serveur Norys Reels n\'a pas démarré à temps.'));
          return;
        }
        setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: '#06060F',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(SERVER_URL);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
ipcMain.handle('open-output-folder', async () => {
  const outDir = path.join(require('os').homedir(), 'Desktop', 'Norys Reels Output');
  try {
    if (!require('fs').existsSync(outDir)) require('fs').mkdirSync(outDir, { recursive: true });
    // shell.openPath() résout en chaîne vide en cas de succès, ou un message
    // d'erreur sinon — jamais de rejet, donc le bouton pouvait échouer en
    // silence sans qu'aucune erreur ne soit jamais visible côté utilisateur.
    const err = await shell.openPath(outDir);
    if (err) console.error('[Norys Reels] shell.openPath a échoué:', err);
    return { ok: !err, path: outDir, error: err || null };
  } catch (e) {
    console.error('[Norys Reels] open-output-folder error:', e.message);
    return { ok: false, path: outDir, error: e.message };
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    startServer();
    try {
      await waitForServer();
    } catch (e) {
      console.error('[Norys Reels]', e.message);
    }
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    killServerTree();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    killServerTree();
  });
}
