// electron-builder afterPack hook.
//
// win.signAndEditExecutable est désactivé (false) car activé, il déclenche
// le téléchargement de "winCodeSign" — un paquet qui contient aussi des
// outils macOS et dont l'extraction crée des liens symboliques. Sur une
// machine Windows sans Mode développeur/droits admin, ça plante avec
// "Cannot create symbolic link". Conséquence : rcedit (qui incruste
// l'icône personnalisée dans l'exe) ne tournait plus jamais, donc l'exe
// gardait l'icône Electron par défaut.
//
// Ce hook fait juste ça nous-mêmes, après l'empaquetage, sans toucher au
// reste du mécanisme de signature/winCodeSign.
const path = require('path');
const fs = require('fs');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const { rcedit } = require('rcedit');
  const iconPath = path.join(context.packager.projectDir, 'assets', 'icon.ico');
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);

  if (!fs.existsSync(exePath)) {
    console.warn('[after-pack-icon] exe introuvable, on saute :', exePath);
    return;
  }

  await rcedit(exePath, { icon: iconPath });
  console.log('[after-pack-icon] icône incrustée dans', exePath);
};
