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
// Avant ça, une mise à jour voulait dire retélécharger et réinstaller
// manuellement depuis le site à chaque fois. electron-updater vérifie
// la dernière release GitHub (latest.yml, déjà généré par electron-builder),
// télécharge la mise à jour en arrière-plan, puis prévient l'UI une fois
// prête — l'utilisateur n'a qu'à cliquer "Redémarrer pour installer".
// Ne s'applique qu'à l'installeur NSIS : le portable n'a pas de mécanisme
// de remplacement automatique, donc on ignore silencieusement les erreurs
// dans ce cas (checkForUpdates() échoue proprement, sans planter l'app).
function setupAutoUpdater() {
  if (!app.isPackaged) return; // inutile en dev (electron .), pas de release à comparer

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-ready', { version: info.version });
  });
  autoUpdater.on('error', (err) => {
    console.log('[Norys Reels] auto-update:', err.message);
  });

  autoUpdater.checkForUpdates().catch((e) => {
    console.log('[Norys Reels] checkForUpdates:', e.message);
  });
}

ipcMain.on('restart-and-install-update', () => {
  // (isSilent, isForceRunAfter) : sans ça, l'installeur NSIS rouvrait son
  // assistant complet (choix du dossier, etc.) à chaque mise à jour — on
  // dirait que ça réinstalle une toute nouvelle app au lieu de juste
  // remplacer les fichiers et relancer.
  autoUpdater.quitAndInstall(true, true);
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
