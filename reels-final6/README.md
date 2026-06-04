# 🎬 Reels Duplicator — App locale

## Installation (1 seule fois)

### 1. Node.js
https://nodejs.org → version LTS

### 2. FFmpeg

**Windows :**
- Télécharge : https://ffmpeg.org/download.html (gyan.dev builds)
- Extraire dans `C:\ffmpeg`
- Variables d'environnement → PATH → Nouveau → `C:\ffmpeg\bin`
- Redémarrer le PC

**Mac :**
```
brew install ffmpeg
```

## Utilisation

**Windows :** Double-clic sur `LANCER.bat`

**Mac/Linux :**
```
node server.js
```

Le navigateur s'ouvre automatiquement sur http://localhost:3333

## Dans l'app

1. Glisse tes vidéos dans la zone
2. Choisis le nombre de variantes (slider)
3. Active/désactive les filtres que tu veux
4. Clique sur "Générer"
5. Les variantes apparaissent dans `./output`
