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
  if (context.electronPlatformName === 'win32') {
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
    return;
  }

  if (context.electronPlatformName === 'darwin') {
    // Pas de compte développeur Apple (CSC_IDENTITY_AUTO_DISCOVERY=false
    // dans le workflow CI) → le .app sort complètement non signé. Combiné
    // au flag de quarantaine que Safari ajoute au téléchargement, macOS
    // affiche alors « est endommagé et ne peut pas être ouvert » au lieu
    // du message « développeur non identifié » habituel — et ce message
    // "endommagé" ne peut PAS être contourné par un clic droit > Ouvrir.
    // Une signature ad-hoc (gratuite, sans certificat) suffit à faire
    // réapparaître le message normal, contournable.
    const { execFileSync } = require('child_process');
    const appName = `${context.packager.appInfo.productFilename}.app`;
    const appPath = path.join(context.appOutDir, appName);

    if (!fs.existsSync(appPath)) {
      console.warn('[after-pack-icon] .app introuvable, on saute :', appPath);
      return;
    }

    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
      console.log('[after-pack-icon] signature ad-hoc appliquée à', appPath);
    } catch (e) {
      console.warn('[after-pack-icon] codesign a échoué (pas bloquant) :', e.message);
    }
  }
};
