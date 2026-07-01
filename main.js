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
const { autoUpdater } = require('electron-updater');

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

// ── AUTO-UPDATE ──────────────────────────────────────────────
// Windows (NSIS) : electron-updater télécharge en arrière-plan et installe
// silencieusement → on attend update-downloaded avant d'afficher le bandeau.
//
// macOS : l'installation automatique d'un .dmg requiert une signature
// Apple Developer ID qu'on n'a pas. On écoute update-available à la place :
// dès qu'une version plus récente existe sur GitHub, le bandeau s'affiche
// avec un bouton "Télécharger" qui ouvre la page releases — l'utilisateur
// remplace le DMG manuellement (même procédure que la première installation).
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  const isMac = process.platform === 'darwin';
  autoUpdater.autoDownload = !isMac;
  autoUpdater.autoInstallOnAppQuit = false;

  if (isMac) {
    autoUpdater.on('update-available', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-ready', { version: info.version, macManual: true });
    });
  } else {
    autoUpdater.on('update-downloaded', (info) => {
      if (mainWindow) mainWindow.webContents.send('update-ready', { version: info.version });
    });
  }

  autoUpdater.on('error', (err) => {
    console.log('[Norys Reels] auto-update:', err.message);
  });

  autoUpdater.checkForUpdates().catch((e) => {
    console.log('[Norys Reels] checkForUpdates:', e.message);
  });
}

ipcMain.on('restart-and-install-update', () => {
  if (process.platform === 'darwin') {
    // Ouvre la page releases GitHub pour que l'utilisateur télécharge le DMG
    shell.openExternal('https://github.com/nowax0tv/NorysReelsApp/releases');
  } else {
    // (isSilent, isForceRunAfter) : sans ça, l'installeur NSIS rouvrait son
    // assistant complet à chaque mise à jour.
    autoUpdater.quitAndInstall(true, true);
  }
});

ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
// Ouvre le checkout Stripe (page web norystracking) dans le navigateur
// système — pas dans la fenêtre Electron elle-même, qui n'a pas de session
// de paiement. Limité au domaine du site pour éviter d'en faire un moyen
// d'ouvrir n'importe quelle URL arbitraire depuis le renderer.
const ALLOWED_EXTERNAL_HOSTS = ['nrys.link', 'www.nrys.link', 'localhost'];
ipcMain.on('open-external-url', (_event, url) => {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_EXTERNAL_HOSTS.includes(parsed.hostname)) {
      console.error('[Norys Reels] open-external-url refusé, domaine non autorisé:', parsed.hostname);
      return;
    }
    shell.openExternal(url);
  } catch (e) {
    console.error('[Norys Reels] open-external-url URL invalide:', e.message);
  }
});

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
    setupAutoUpdater();
  });

  app.on('window-all-closed', () => {
    killServerTree();
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    killServerTree();
  });
}
