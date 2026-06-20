# 🎬 Norys Reels — Duplicateur vidéo Instagram

Génère des variantes uniques d'une vidéo avec des specs optimisées pour percer sur Instagram.  
Chaque variante a une signature binaire différente grâce à la randomisation des filtres et des métadonnées.

---

## Installation (1 seule fois)

**Double-clique sur `INSTALLER.bat`** — il installe automatiquement Node.js et FFmpeg si absents.

> ⚠️ Pour les sous-titres, FFmpeg doit être compilé avec `--enable-libass`.  
> La version installée par l'installer (BtbN builds) inclut libass.  
> Si tu as une version custom sans libass, les variantes seront générées sans sous-titres (fallback automatique).

### Installation manuelle

**Node.js** → https://nodejs.org (version LTS)

**FFmpeg Windows** :
- Télécharge : https://github.com/BtbN/FFmpeg-Builds/releases (ffmpeg-master-latest-win64-gpl.zip)
- Extraire dans `C:\ffmpeg`
- Variables d'environnement → PATH → Nouveau → `C:\ffmpeg`
- Redémarrer le PC

**FFmpeg Mac** : `brew install ffmpeg`  
**FFmpeg Linux** : `sudo apt install ffmpeg`

---

## Lancement

**Windows** : Double-clique sur `LANCER.bat`  
**Mac/Linux** : `node server.js`

Le navigateur s'ouvre sur **http://localhost:3333**

---

## Fonctionnalités

### 🎬 Vidéos source
Glisse-dépose tes vidéos MP4 ou MOV dans la zone de drop.  
Plusieurs vidéos simultanées supportées.

### 📝 Sous-titres
Activer le toggle pour accéder à l'éditeur de sous-titres.

- **Charger une vidéo** dans la preview pour voir le rendu en temps réel
- **Drag & drop** du texte : clique sur le texte dans la preview et glisse-le où tu veux
- **Snap rapide** : boutons Haut / Centre / Bas
- **Presets** : Classic, TikTok, Jaune, Minimal, Neon, Bold
- **Couleur** : 5 swatches + color picker personnalisé
- **Fond** : Aucun / Semi-transparent / Noir plein / Blanc / Jaune
- **Taille** : 24px à 90px
- **Gras** : on/off
- **Texte** : une ligne = un sous-titre distinct, réparti automatiquement sur la durée

> Les sous-titres sont gravés directement dans la vidéo (hardcoded), pas un track séparé.

### 🎨 Filtres (17 filtres)

**🟢 Invisibles** (hash unique, imperceptibles à l'œil) :
- Re-encode propre, Sharpen x0.3/x0.6, Zoom +1%/+2%/+3%
- Grain micro/léger, Vignette x0.1, Bright +1%, Sat +2%, Contrast +5%

**🟡 Subtils** (légère amélioration du reach) :
- Sharpen net, Pop (contraste+sat), Warm skin +3°, Clarté midtones, Ciné (-10% sat)

**🔴 Créatifs** (effet visible, désactivés par défaut) :
- Mirror flip, Random cuts

> Tous les paramètres de filtres sont **randomisés** à chaque variante dans leur plage safe → des millions de combinaisons uniques.

### 🔄 Nombre de variantes
Slider de 1 à 500 variantes par vidéo.

### ⚙️ Mode combiné
Active pour combiner 2 filtres sur chaque variante.

### 🔀 Convertisseur MOV → MP4
Convertit les fichiers MOV (iPhone) en MP4 compatible Instagram.

---

## Specs d'encodage Instagram

Chaque variante est encodée avec les specs optimales pour éviter la recompression par Instagram :

| Paramètre | Valeur |
|---|---|
| Codec | H.264 (libx264) |
| Profile | High, Level 4.0 |
| CRF | 18 (qualité max) |
| Preset | slow (meilleure compression) |
| Maxrate | 6 Mbps |
| FPS | 30fps fixe |
| Audio | AAC 192k, 48kHz |
| Color space | yuv420p |
| Faststart | ✅ |

---

## CLI (sans interface)

```
node core.js          # 10 variantes
node core.js 60       # 60 variantes
node core.js 200      # 200 variantes
```

Met tes vidéos dans `./input/`, les variantes arrivent dans `./output/`.

---

## Unicité des variantes

Chaque variante est unique grâce à la combinaison de :
- **Paramètres de filtre randomisés** (ex: contrast entre 0.5% et 5%)
- **Device simulé** (iPhone 15 Pro Max, Samsung S24 Ultra, Pixel 8...)
- **Coordonnées GPS** (20 villes US)
- **Date de création** (1 à 30 jours en arrière, heure aléatoire)
- **Métadonnées EXIF** effacées et réécrites

→ Même 1000 variantes du même filtre "Re-encode propre" sont toutes différentes au niveau binaire.
