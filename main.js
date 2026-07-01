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
// silencieusement via quitAndInstall().
//
// macOS : electron-updater exige une signature Apple Developer ID pour
// fonctionner — même pour le simple checkForUpdates(). Sans certificat,
// tout le module échoue silencieusement. On contourne complètement
// electron-updater sur Mac : on télécharge latest-mac.yml depuis la release
// GitHub, on compare les versions, et on affiche le bandeau si une version
// plus récente existe. L'utilisateur télécharge et remplace le DMG lui-même.
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  if (process.platform === 'darwin') {
    checkForMacUpdateManual();
  } else {
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
}

// Récupère latest-mac.yml depuis la release GitHub "Soft" et compare
// avec la version courante. Suit les redirects HTTP 301/302.
function fetchUrlText(url, redirectsLeft) {
  const https = require('https');
  redirectsLeft = redirectsLeft !== undefined ? redirectsLeft : 5;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
        resolve(fetchUrlText(res.headers.location, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function isNewerVersion(latest, current) {
  const parse = v => (v || '').split('.').map(n => parseInt(n, 10) || 0);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  return la > ca || (la === ca && lb > cb) || (la === ca && lb === cb && lc > cc);
}

async function checkForMacUpdateManual() {
  try {
    const yaml = await fetchUrlText(
      'https://github.com/nowax0tv/NorysReelsApp/releases/download/Soft/latest-mac.yml'
    );
    const match = yaml.match(/^version:\s*['"]?([^\s'"]+)['"]?/m);
    if (!match) return;
    const latest = match[1];
    const current = app.getVersion();
    if (isNewerVersion(latest, current)) {
      if (mainWindow) mainWindow.webContents.send('update-ready', { version: latest, macManual: true });
    }
  } catch (e) {
    console.log('[Norys Reels] Mac update check:', e.message);
  }
}

ipcMain.on('restart-and-install-update', () => {
  if (process.platform === 'darwin') {
    // Téléchargement direct du DMG — évite que l'utilisateur clique sur une vieille release
    shell.openExternal('https://github.com/nowax0tv/NorysReelsApp/releases/download/Soft/NorysReels-Mac.dmg');
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
