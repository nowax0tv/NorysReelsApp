// ============================================================
//  Norys Reels — Serveur local
//  node server.js → http://localhost:3333
// ============================================================

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { execSync } = require('child_process');
const https  = require('https');

const PORT = 3333;

// ── FFMPEG / FFPROBE EMBARQUÉS ──────────────────────────────────
// L'app supposait que ffmpeg/ffprobe étaient déjà installés et sur le PATH
// système — ce qui n'est jamais le cas chez un utilisateur normal (pas un
// dev). On embarque les binaires via ffmpeg-static/ffprobe-static, avec un
// repli sur le PATH système uniquement si jamais les binaires embarqués
// sont introuvables (ex: build cassé).
function resolveBinary(staticPkgPath, fallbackName){
  try {
    if(staticPkgPath && fs.existsSync(staticPkgPath)) return staticPkgPath;
  } catch {}
  return fallbackName;
}
const FFMPEG_BIN  = resolveBinary(require('ffmpeg-static'), 'ffmpeg');
const FFPROBE_BIN = resolveBinary(require('ffprobe-static').path, 'ffprobe');
// Pour les commandes construites en string (besoin de guillemets si chemin avec espaces)
const FFMPEG_CMD  = '"' + FFMPEG_BIN  + '"';
const FFPROBE_CMD = '"' + FFPROBE_BIN + '"';
console.log('🎬 ffmpeg :', FFMPEG_BIN);
console.log('🎬 ffprobe:', FFPROBE_BIN);

const DEVICES = [
  { make:'Apple',   model:'iPhone 15 Pro Max', software:'17.4.0' },
  { make:'Apple',   model:'iPhone 15 Pro',     software:'17.3.1' },
  { make:'Apple',   model:'iPhone 15',         software:'17.4.0' },
  { make:'Apple',   model:'iPhone 14 Pro Max', software:'17.2.1' },
  { make:'Samsung', model:'SM-S928U',          software:'14'     },
  { make:'Samsung', model:'SM-S921U',          software:'14'     },
  { make:'Google',  model:'Pixel 8 Pro',       software:'14'     },
  { make:'Google',  model:'Pixel 8',           software:'14'     },
];

const LOCATIONS = [
  { lat:'34.0522',  lon:'-118.2437', city:'Los Angeles'   },
  { lat:'40.7128',  lon:'-74.0060',  city:'New York'      },
  { lat:'25.7617',  lon:'-80.1918',  city:'Miami'         },
  { lat:'36.1699',  lon:'-115.1398', city:'Las Vegas'     },
  { lat:'33.7490',  lon:'-84.3880',  city:'Atlanta'       },
  { lat:'30.2672',  lon:'-97.7431',  city:'Austin'        },
  { lat:'47.6062',  lon:'-122.3321', city:'Seattle'       },
  { lat:'37.7749',  lon:'-122.4194', city:'San Francisco' },
  { lat:'41.8781',  lon:'-87.6298',  city:'Chicago'       },
  { lat:'29.7604',  lon:'-95.3698',  city:'Houston'       },
  { lat:'42.3601',  lon:'-71.0589',  city:'Boston'        },
  { lat:'35.4676',  lon:'-97.5164',  city:'Oklahoma City' },
  { lat:'36.1627',  lon:'-86.7816',  city:'Nashville'     },
  { lat:'45.5152',  lon:'-122.6784', city:'Portland'      },
  { lat:'39.9526',  lon:'-75.1652',  city:'Philadelphia'  },
  { lat:'32.7767',  lon:'-96.7970',  city:'Dallas'        },
  { lat:'33.4484',  lon:'-112.0740', city:'Phoenix'       },
  { lat:'44.9778',  lon:'-93.2650',  city:'Minneapolis'   },
  { lat:'39.7392',  lon:'-104.9903', city:'Denver'        },
  { lat:'29.4241',  lon:'-98.4936',  city:'San Antonio'   },
];

// ── MODÈLES iPhone (sélecteur manuel page Générer) ─────────────
const IPHONE_MODELS = [
  { id:'iphone15promax', make:'Apple', model:'iPhone 15 Pro Max', software:'17.4.0' },
  { id:'iphone15pro',    make:'Apple', model:'iPhone 15 Pro',     software:'17.3.1' },
  { id:'iphone15',       make:'Apple', model:'iPhone 15',         software:'17.4.0' },
  { id:'iphone14promax', make:'Apple', model:'iPhone 14 Pro Max', software:'17.2.1' },
  { id:'iphone14pro',    make:'Apple', model:'iPhone 14 Pro',     software:'17.1.2' },
  { id:'iphone13promax', make:'Apple', model:'iPhone 13 Pro Max', software:'17.0.3' },
];
function findIphoneModel(id){ return IPHONE_MODELS.find(m => m.id === id) || null; }

// ── LOCALISATIONS GPS par pays (sélecteur manuel page Générer) ──
const LOCATIONS_BY_COUNTRY = {
  us: LOCATIONS,
  fr: [
    { lat:'48.8566', lon:'2.3522',  city:'Paris'     },
    { lat:'45.7640', lon:'4.8357',  city:'Lyon'      },
    { lat:'43.2965', lon:'5.3698',  city:'Marseille' },
    { lat:'44.8378', lon:'-0.5792', city:'Bordeaux'  },
    { lat:'43.6047', lon:'1.4442',  city:'Toulouse'  },
  ],
  gb: [
    { lat:'51.5072', lon:'-0.1276', city:'London'      },
    { lat:'53.4808', lon:'-2.2426', city:'Manchester'  },
    { lat:'52.4862', lon:'-1.8904', city:'Birmingham'  },
  ],
  ca: [
    { lat:'43.6532', lon:'-79.3832', city:'Toronto'   },
    { lat:'45.5019', lon:'-73.5674', city:'Montreal'  },
    { lat:'49.2827', lon:'-123.1207', city:'Vancouver' },
  ],
};
function pickLocationForCountry(country){
  if(country && country !== 'random' && LOCATIONS_BY_COUNTRY[country]) return pick(LOCATIONS_BY_COUNTRY[country]);
  const all = Object.values(LOCATIONS_BY_COUNTRY).flat();
  return pick(all);
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(a,b){ return Math.floor(Math.random()*(b-a)+a); }

function randomDate(){
  const d = new Date(Date.now() - randInt(1,30)*86400000);
  const h=randInt(9,22), m=randInt(0,59), s=randInt(0,59);
  return `${d.getFullYear()}:${String(d.getMonth()+1).padStart(2,'0')}:${String(d.getDate()).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}



// ── NOTO COLOR EMOJI FONT ─────────────────────────────────────
// Téléchargée une seule fois dans le dossier de l'app
// Utilisée par FFmpeg/libass pour rendre les emojis proprement
const FONT_DIR        = path.join(__dirname, 'fonts');
const FONT_PATH       = path.join(FONT_DIR, 'NotoColorEmoji.ttf');
const FONT_URL        = 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf';
const MONTSERRAT_PATH = path.join(FONT_DIR, 'Montserrat-Bold.ttf');
const MONTSERRAT_URL  = 'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf';

const EXTRA_FONTS = [
  { key:'anton',     file:'Anton-Regular.ttf',    url:'https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf' },
  { key:'oswald',    file:'Oswald-Bold.ttf',       url:'https://github.com/google/fonts/raw/main/ofl/oswald/static/Oswald-Bold.ttf' },
  { key:'pacifico',  file:'Pacifico-Regular.ttf',  url:'https://github.com/google/fonts/raw/main/ofl/pacifico/Pacifico-Regular.ttf' },
  { key:'spacemono', file:'SpaceMono-Bold.ttf',         url:'https://github.com/google/fonts/raw/main/ofl/spacemono/SpaceMono-Bold.ttf' },
  { key:'barlow',    file:'BarlowCondensed-Black.ttf',  url:'https://github.com/google/fonts/raw/main/ofl/barlowcondensed/BarlowCondensed-Black.ttf' },
  { key:'inter',     file:'Inter-Bold.ttf',             url:'https://github.com/google/fonts/raw/main/ofl/inter/static/Inter-Bold.ttf' },
];

const FONT_FILES = {
  montserrat: { assName:'Montserrat-Bold',       path: MONTSERRAT_PATH },
  anton:      { assName:'Anton-Regular',         path: path.join(FONT_DIR,'Anton-Regular.ttf') },
  oswald:     { assName:'Oswald-Bold',           path: path.join(FONT_DIR,'Oswald-Bold.ttf') },
  pacifico:   { assName:'Pacifico-Regular',      path: path.join(FONT_DIR,'Pacifico-Regular.ttf') },
  spacemono:  { assName:'SpaceMono-Bold',        path: path.join(FONT_DIR,'SpaceMono-Bold.ttf') },
  barlow:     { assName:'BarlowCondensed-Black', path: path.join(FONT_DIR,'BarlowCondensed-Black.ttf') },
  inter:      { assName:'Inter-Bold',            path: path.join(FONT_DIR,'Inter-Bold.ttf') },
};

let notoFontReady = false;

function downloadFont(){
  return new Promise((resolve) => {
    if(fs.existsSync(FONT_PATH)){
      console.log('🎨 Font emoji : NotoColorEmoji.ttf déjà présente');
      notoFontReady = true;
      return resolve();
    }
    if(!fs.existsSync(FONT_DIR)) fs.mkdirSync(FONT_DIR, {recursive:true});
    console.log('⬇️  Téléchargement de NotoColorEmoji.ttf (~10MB)...');
    const file = fs.createWriteStream(FONT_PATH);
    const request = (url, depth=0) => {
      if(depth > 5) { console.error('❌ Trop de redirections'); return resolve(); }
      https.get(url, (res) => {
        if(res.statusCode === 301 || res.statusCode === 302){
          return request(res.headers.location, depth+1);
        }
        if(res.statusCode !== 200){
          console.error('❌ Erreur téléchargement font:', res.statusCode);
          return resolve();
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('✅ NotoColorEmoji.ttf téléchargée');
          notoFontReady = true;
          resolve();
        });
      }).on('error', (e) => {
        console.error('❌ Erreur font:', e.message);
        try { fs.unlinkSync(FONT_PATH); } catch{}
        resolve();
      });
    };
    request(FONT_URL);
  });
}

function downloadFontFile(label, destPath, url){
  return new Promise((resolve) => {
    if(fs.existsSync(destPath)) return resolve();
    if(!fs.existsSync(FONT_DIR)) fs.mkdirSync(FONT_DIR,{recursive:true});
    console.log('⬇️  Téléchargement de '+label+'...');
    const file = fs.createWriteStream(destPath);
    const request = (u, depth=0) => {
      if(depth > 5) return resolve();
      https.get(u, (res) => {
        if(res.statusCode === 301 || res.statusCode === 302) return request(res.headers.location, depth+1);
        if(res.statusCode !== 200){ console.error('❌ Erreur '+label+':', res.statusCode); return resolve(); }
        res.pipe(file);
        file.on('finish', () => { file.close(); console.log('✅ '+label+' téléchargée'); resolve(); });
      }).on('error', () => resolve());
    };
    request(url);
  });
}
function downloadMontserrat(){ return downloadFontFile('Montserrat-Bold.ttf', MONTSERRAT_PATH, MONTSERRAT_URL); }
function downloadExtraFonts(){
  return Promise.all(EXTRA_FONTS.map(f => downloadFontFile(f.file, path.join(FONT_DIR, f.file), f.url)));
}

// ── CAPTION UTILS ─────────────────────────────────────────────

function getVideoDuration(filePath){
  try {
    const out = execSync(
      `${FFPROBE_CMD} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { stdio:'pipe' }
    ).toString().trim();
    return parseFloat(out) || 30;
  } catch { return 30; }
}

function buildSRT(lines, totalDuration, posX, posY, rotation){
  if(!lines || !lines.length) return null;
  const count = lines.length;
  const fmt = t => {
    const h  = Math.floor(t/3600);
    const m  = Math.floor((t%3600)/60);
    const sc = Math.floor(t%60);
    const ms = Math.round((t%1)*1000);
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sc).padStart(2,'0')+','+String(ms).padStart(3,'0');
  };
  const rot = rotation && rotation !== 0 ? '\\frz'+(-(rotation)) : ''; // ASS \frz = CCW, CSS rotate = CW → negate
  const posTag = (posX !== undefined && posY !== undefined)
    ? '{\\pos('+posX+','+posY+')'+rot+'}'
    : (rot ? '{'+rot+'}' : '');
  let srt = '';
  lines.forEach((line,i) => {
    const st = line.start !== undefined ? line.start : (totalDuration/count)*i;
    const e  = line.end   !== undefined ? line.end   : (totalDuration/count)*(i+1) - 0.1;
    srt += (i+1)+'\n'+fmt(st)+' --> '+fmt(e)+'\n'+posTag+line.text+'\n\n';
  });
  return srt;
}

// #RRGGBB → ASS BGR &H00BBGGRR
function hexToASS(hex){
  const h = hex.replace('#','').padEnd(6,'0');
  return '&H00' + h.slice(4,6) + h.slice(2,4) + h.slice(0,2);
}

// Construit le filtre FFmpeg subtitles= avec force_style ASS
function buildCaptionFilter(srtPath, cs){
  cs = cs || {};
  const color        = cs.color        || '#FFFFFF';
  const bg           = cs.bg           || 'none';
  const size         = parseInt(cs.size) || 52;
  const bold         = cs.bold !== false ? 1 : 0;
  const strokeWidth  = cs.strokeWidth  !== undefined ? parseFloat(cs.strokeWidth)  : 3;
  const strokeColor  = cs.strokeColor  || '#000000';

  // Position libre xPct/yPct (% de 1080x1920)
  const xPct = cs.xPct !== undefined ? parseFloat(cs.xPct) : 50;
  const yPct = cs.yPct !== undefined ? parseFloat(cs.yPct) : 85;
  cs._posX = Math.round(1080 * xPct / 100);
  cs._posY = Math.round(1920 * yPct / 100);

  const primaryColour = hexToASS(color);
  const outlineColour = hexToASS(strokeColor);

  let backColour = '&H00000000', borderStyle = 1, outline = strokeWidth, shadow = 1;
  if(bg === 'black_semi') { backColour='&H99000000'; borderStyle=3; outline=0; shadow=0; }
  if(bg === 'black_full') { backColour='&HFF000000'; borderStyle=3; outline=0; shadow=0; }
  if(bg === 'white_full') { backColour='&HFFFFFFFF'; borderStyle=3; outline=0; shadow=0; }
  if(bg === 'yellow_full'){ backColour='&HFF00E6FF'; borderStyle=3; outline=0; shadow=0; }

  // Noto Color Emoji : font embarquée pour des emojis propres sur tous les OS
  // fontsdir= indique à libass où chercher les fonts custom
  const fontDir = fs.existsSync(FONT_PATH)
    ? path.dirname(FONT_PATH).replace(/\\/g,'/').replace(/:/g,'\\:')
    : null;

  // Police sélectionnée par l'utilisateur, avec fallback Montserrat → Arial
  const fontKey  = cs.font || 'montserrat';
  const fontInfo = FONT_FILES[fontKey] || FONT_FILES.montserrat;
  const fontName = fs.existsSync(fontInfo.path) ? fontInfo.assName
    : fs.existsSync(MONTSERRAT_PATH) ? 'Montserrat-Bold' : 'Arial';

  const styleStr = [
    'FontName='+fontName, 'FontSize='+size,
    'PrimaryColour='+primaryColour, 'BackColour='+backColour,
    'OutlineColour='+outlineColour, 'Outline='+outline, 'Shadow='+shadow,
    'BorderStyle='+borderStyle, 'Alignment=5',
    'MarginL=0', 'MarginR=0', 'MarginV=0', 'Bold='+bold,
  ].join(',');

  const escaped = srtPath.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
  const fontsDirArg = fontDir ? ':fontsdir=\'' + fontDir + '\'' : '';
  return "subtitles='"+escaped+"'"+fontsDirArg+":force_style='"+styleStr+"'";
}


// ── RANDOMISATION DES FILTRES ─────────────────────────────────
// Chaque paramètre varie légèrement à chaque variante
// → des millions de combinaisons uniques même avec le même filtre de base

function rnd(min, max){
  return +(Math.random() * (max - min) + min).toFixed(4);
}

// Reçoit le filter string de base et randomise ses paramètres dans leur plage safe
function randomizeFilter(filter){
  if(!filter) return filter;

  // ── PLAGES RANDOMISATION — max safe Instagram ───────────────
  // Règles : CRF 18 = qualité source haute → on peut pousser plus fort
  // Instagram recompresse si bitrate > 6Mbps, pas si valeurs EQ dans ces plages

  filter = filter.replace(/eq=([^,'"]+)/g, (match, params) => {
    const parts = params.split(':').map(p => {
      if(p.startsWith('contrast=')){
        const cur = parseFloat(p.split('=')[1]);
        // Varier AUTOUR de la valeur de base ±8%
        const delta = rnd(-0.08, 0.08);
        return 'contrast=' + Math.max(1.0, +(cur + delta).toFixed(4));
      }
      if(p.startsWith('brightness=')){
        const cur = parseFloat(p.split('=')[1]);
        // Varier autour de la base ±0.04
        const delta = rnd(-0.04, 0.04);
        return 'brightness=' + +(cur + delta).toFixed(4);
      }
      if(p.startsWith('saturation=')){
        const cur = parseFloat(p.split('=')[1]);
        // Varier autour de la base ±15% — donc Sat 1.40 reste entre 1.25 et 1.55
        const delta = rnd(-0.15, 0.15);
        return 'saturation=' + Math.max(0.1, +(cur + delta).toFixed(4));
      }
      return p;
    });
    return 'eq=' + parts.join(':');
  });

  // Sharpen : 0.6 à 2.0 — différence franche entre variantes
  // Max 2.0 = limite avant artefacts sur peau (halo effect)
  if(filter.includes('unsharp=')){
    filter = filter.replace(/unsharp=\d+:\d+:[\d.]+:\d+:\d+:[\d.]+/, m => {
      const parts = m.replace('unsharp=','').split(':');
      return 'unsharp='+parts[0]+':'+parts[1]+':'+rnd(0.6, 2.0)+':'+parts[3]+':'+parts[4]+':0.0';
    });
  }

  // Grain : 3 à 10 — visible à l'écran, texture cinéma
  // Max 10 = grain marqué mais pas de pixelisation
  filter = filter.replace(/noise=alls=[\d.]+/, () => 'noise=alls=' + rnd(3, 10));

  // Vignette : 0.2 à 0.8 — assombrissement des coins clairement visible
  filter = filter.replace(/vignette=[\d.]+/, () => 'vignette=' + rnd(0.2, 0.8));

  // Zoom : 1% à 8% — crop vraiment différent entre variantes
  // Max 8% = qualité préservée avec CRF 18
  if(filter.includes('scale=iw*') && filter.includes('crop=iw/')){
    const z = rnd(1.01, 1.08);
    filter = filter.replace(/scale=iw\*[\d.]+:ih\*[\d.]+,crop=iw\/[\d.]+:ih\/[\d.]+/, 'scale=iw*'+z+':ih*'+z+',crop=iw/'+z+':ih/'+z);
  }

  // Colorbalance : ±0.06 — warm/cool clairement perceptible
  filter = filter.replace(/colorbalance=([^,'"]+)/g, (match, params) => {
    const parts = params.split(':').map(p => {
      const [k, v] = p.split('=');
      return k + '=' + +(parseFloat(v) + rnd(-0.06, 0.06)).toFixed(4);
    });
    return 'colorbalance=' + parts.join(':');
  });

  // Hue : ±8° — teinte perceptiblement différente sans dénaturer
  filter = filter.replace(/hue=h=(-?[\d.]+)/g, (m, h) =>
    'hue=h=' + +(parseFloat(h) + rnd(-8, 8)).toFixed(1));

  // hflip/vflip — ajouter micro-variation pour hash unique (le flip seul est identique)
  if(filter === 'hflip'){
    const b = rnd(-0.03, 0.03);
    filter = 'hflip,eq=brightness='+b.toFixed(4)+':contrast='+rnd(1.02,1.08).toFixed(4);
  }
  if(filter === 'vflip'){
    const b = rnd(-0.03, 0.03);
    filter = 'vflip,eq=brightness='+b.toFixed(4)+':saturation='+rnd(1.02,1.08).toFixed(4);
  }

  // rotate= : ±5° autour de la valeur de base — différence vraiment visible
  // rotate= : valeur en radians, ±0.087 rad (±5°) autour de la base
  // rotate= : entre 5° et 15°, positif ou négatif
  // rotate= : entre 5° et 15°, positif ou négatif
  // fillcolor=black@0 pour rendre les coins transparents
  // Le blur bg est ajouté dans generateVariant via filter_complex
  if(filter.includes('rotate=') && filter.includes('fillcolor=black')){
    const minRad = 0.0873;
    const maxRad = 0.2618;
    const sign   = Math.random() > 0.5 ? 1 : -1;
    const angle  = +(sign * rnd(minRad, maxRad)).toFixed(4);
    // Marquer avec angle pour que generateVariant construise le filter_complex
    filter = '__rotate__' + angle;
  }

  return filter;
}


// ── RANDOM CUTS ───────────────────────────────────────────────
// Coupe la vidéo en N segments et les réassemble dans un ordre aléatoire
function generateRandCut(inputFile, outputFile, vfStr, args){
  try {
    // Récupérer la durée
    const duration = getVideoDuration(inputFile);
    if(duration < 2) return false; // trop courte pour couper

    // Nombre de segments aléatoire entre 2 et 4
    const numCuts = randInt(2, 5);
    const segDur  = duration / numCuts;

    // Créer les fichiers segments temporaires
    const tmpSegs = [];
    const listFile = path.join(os.tmpdir(), 'norys_cuts_'+Date.now()+'.txt');

    for(let i=0; i<numCuts; i++){
      const segPath = path.join(os.tmpdir(), 'norys_seg_'+Date.now()+'_'+i+'.mp4');
      const start   = +(i * segDur).toFixed(3);
      const dur     = +(segDur).toFixed(3);
      const segCmd  = FFMPEG_CMD+' -y -ss '+start+' -t '+dur+' -i "'+inputFile+'" '+
        (vfStr ? '-vf "'+vfStr+'"' : '')+
        ' -c:v libx264 -profile:v high -level 4.0 -crf 21 -preset fast -maxrate 6M -bufsize 12M'+
        ' -c:a aac -ar 48000 -b:a 192k "'+segPath+'"';
      try {
        execSync(segCmd, {stdio:'pipe', timeout:60000});
        tmpSegs.push(segPath);
      } catch(e){ console.error('Segment error:', e.message.slice(0,100)); }
    }

    if(tmpSegs.length < 2){ tmpSegs.forEach(f => { try{ fs.unlinkSync(f); }catch{} }); return false; }

    // Mélanger les segments
    tmpSegs.sort(() => Math.random() - 0.5);

    // Créer le fichier liste pour concat
    const listContent = tmpSegs.map(f => 'file ' + JSON.stringify(f)).join('\n');
    fs.writeFileSync(listFile, listContent, 'utf8');

    // Concatener
    const concatCmd = FFMPEG_CMD+' -y -f concat -safe 0 -i "'+listFile+'" -c copy "'+outputFile+'"';
    execSync(concatCmd, {stdio:'pipe', timeout:300000});

    // Cleanup
    tmpSegs.forEach(f => { try{ fs.unlinkSync(f); }catch{} });
    try{ fs.unlinkSync(listFile); }catch{}
    return true;
  } catch(e){
    console.error('RandCut error:', e.message.slice(0,200));
    return false;
  }
}

// ── GENERATE VARIANT ──────────────────────────────────────────

function generateVariant(inputFile, outputFile, filter, special, captionLines, captionStyle, musicFile, musicMode, musicVol, origVol, shrinkBgMode, shrinkBgColor, metaOpts, onProgress){
  special       = special       || '';
  captionLines  = captionLines  || [];
  captionStyle  = captionStyle  || {};
  shrinkBgMode  = shrinkBgMode  || 'blur';
  shrinkBgColor = (shrinkBgColor||'#ff69b4').replace('#','');
  metaOpts      = metaOpts      || {};
  const injectMetadata = metaOpts.injectMetadata !== false;
  const chosenDevice   = injectMetadata ? (findIphoneModel(metaOpts.deviceModelId) || pick(DEVICES)) : null;
  const chosenLocation = injectMetadata ? pickLocationForCountry(metaOpts.gpsCountry) : null;

  const dev  = chosenDevice;
  const loc  = chosenLocation;
  const date = randomDate();
  // CRF 16 (quasi sans perte) produisait des fichiers énormes (jusqu'à 80+ Mo)
  // pour un gain de qualité invisible une fois recompressé par Instagram à l'upload.
  // CRF 21 reste excellent visuellement et réduit le poids de ~50-60%.
  const CRF    = 21;
  // "slow" donnait une qualité excellente mais rendait la génération de
  // beaucoup de variantes interminable (preset = le plus gros levier de
  // vitesse x264). "medium" encode 2 à 3x plus vite pour une qualité
  // quasi identique au même CRF — le vrai gain qualité de "slow" se voit
  // surtout en dessous de CRF 18, pas ici.
  const PRESET = 'medium';
  const AUDIO  = '192k';

  // Durée connue à l'avance pour calculer une vraie progression en direct
  // (out_time_ms / durée totale) plutôt qu'un saut brutal de 0% à 100%.
  const inputDuration = getVideoDuration(inputFile);

  // ── Captions SRT ─────────────────────────────────────────────
  let srtPath = null;
  if(captionLines.length){
    const duration   = inputDuration;
    const _xPct = (captionStyle && captionStyle.xPct !== undefined) ? parseFloat(captionStyle.xPct) : 50;
    const _yPct = (captionStyle && captionStyle.yPct !== undefined) ? parseFloat(captionStyle.yPct) : 85;
    const posX = Math.round(1080 * _xPct / 100);
    const posY = Math.round(1920 * _yPct / 100);
    const _rot = (captionStyle && captionStyle.rotation) ? parseFloat(captionStyle.rotation) : 0;
    const srtContent = buildSRT(captionLines, duration, posX, posY, _rot);
    if(srtContent){
      srtPath = path.join(os.tmpdir(), 'ncap_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.srt');
      fs.writeFileSync(srtPath, srtContent, 'utf8');
    }
  }

  // ── Extraire rotate et shrink ─────────────────────────────────
  const hasRotate = (filter||'').includes('__rotate__');
  const hasShrink = special === 'shrink';
  let rotateAngle = null;
  let cleanFilter = filter || '';

  // ── Vitesse aléatoire ±10% (setpts vidéo + atempo audio) ───────
  let speedFactor = null;
  if(special === 'speed'){
    speedFactor = +(1 + rnd(-0.10, 0.10)).toFixed(4);
    const ptsFilter = 'setpts=' + (1 / speedFactor).toFixed(4) + '*PTS';
    cleanFilter = cleanFilter ? ptsFilter + ',' + cleanFilter : ptsFilter;
  }

  if(hasRotate){
    const rm = cleanFilter.match(/__rotate__(-?[\d.]+)/);
    if(rm){
      rotateAngle = rm[1];
      cleanFilter = cleanFilter.replace(/,?__rotate__-?[\d.]+,?/g, ',').replace(/^,|,$/g, '');
    }
  }

  // ── Ajouter caption au filtre clean si pas complex ────────────
  if(srtPath && !hasRotate && !hasShrink){
    const captionFilter = buildCaptionFilter(srtPath, captionStyle);
    if(captionFilter) cleanFilter = cleanFilter ? cleanFilter+','+captionFilter : captionFilter;
  }

  // ── Construire la commande FFmpeg ────────────────────────────
  // On utilise execFile-style avec tableau d'args pour éviter les pb d'échappement Windows
  const meta = injectMetadata ? [
    '-map_metadata', '-1',
    '-metadata', 'make='+dev.make,
    '-metadata', 'model='+dev.model,
    '-metadata', 'software='+dev.software,
    '-metadata', 'location='+loc.lat+'+'+loc.lon+'/',
    '-metadata', 'location-eng='+loc.city,
    '-metadata', 'date='+date.split(' ')[0].replace(/:/g,'-'),
    '-metadata', 'comment=',
    '-metadata', 'title=',
  ] : ['-map_metadata', '-1'];

  const encodeArgs = [
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0',
    '-crf', String(CRF), '-preset', PRESET,
    '-maxrate', '6M', '-bufsize', '12M',
    '-r', '30',
    '-c:a', 'aac', '-b:a', AUDIO, '-ar', '48000',
    '-movflags', '+faststart',
  ];

  const trimArgs = rnd(0,1) > 0.05 ? ['-ss', String(+(rnd(0,0.8)).toFixed(4))] : [];

  let args;

  if(hasShrink){
    const sf = +(rnd(0.70, 0.85)).toFixed(3);
    let fc;
    if(bgMode(shrinkBgMode) === 'blur'){
      if(rotateAngle){
        // Même technique que le rotate seul (lignes ~609) : on ajoute un canal
        // alpha (yuva420p) AVANT le pad/rotate pour que fillcolor=black@0 soit
        // vraiment transparent et que le fond flouté reste visible derrière le
        // contenu rétréci. Sans alpha, black@0 devient du noir opaque et cache
        // le blur — c'est le bug "y'a du flou mais y'a du noir".
        const mid = cleanFilter ? cleanFilter+',' : '';
        fc = 'split=2[bg][fg];[bg]scale=w=600:h=1060:force_original_aspect_ratio=increase,crop=600:1060,boxblur=20:5,crop=540:960[blurred];'
           + '[fg]'+mid+'scale=w=540:h=960:force_original_aspect_ratio=decrease,format=yuva420p,pad=540:960:(540-iw)/2:(960-ih)/2:black@0,pad=iw*1.2:ih*1.2:(ow-iw)/2:(oh-ih)/2:black@0,rotate='+rotateAngle+':fillcolor=black@0:ow=iw:oh=ih,crop=iw/1.2:ih/1.2,scale=iw*'+sf+':ih*'+sf+'[small];'
           + '[blurred][small]overlay=(W-w)/2:(H-h)/2,format=yuv420p[out]';
      } else {
        // [fg] doit d'abord être ramené à 540:960 — sinon pour une vidéo
        // déjà plus grande que ça (1080x1920 typique), le facteur de
        // rétrécissement (0.70-0.85) s'applique à SA résolution d'origine
        // et reste plus grand que le canevas : le fond flouté ne se voit
        // alors jamais (bordure invisible, bug constaté en testant).
        const mid = cleanFilter ? cleanFilter+',' : '';
        fc = 'split=2[bg][fg];[bg]scale=w=600:h=1060:force_original_aspect_ratio=increase,crop=600:1060,boxblur=20:5,crop=540:960[blurred];'
           + '[fg]'+mid+'scale=w=540:h=960:force_original_aspect_ratio=decrease,scale=iw*'+sf+':ih*'+sf+',format=yuv420p[small];'
           + '[blurred][small]overlay=(W-w)/2:(H-h)/2,format=yuv420p[out]';
      }
      args = ['-y', ...trimArgs, '-i', inputFile,
        '-filter_complex', fc,
        '-map', '[out]', '-map', '0:a?',
        ...encodeArgs, ...meta, outputFile];
    } else {
      // Couleur unie — même approche que blur mais fond coloré uni
      const bgHex = shrinkBgColor || 'ffffff';
      const inv = +(1/sf).toFixed(4);
      const mid2 = cleanFilter ? cleanFilter+',' : '';
      let fc2;
      if(rotateAngle){
        fc2 = 'color=c=0x'+bgHex+':size=540x960[bg2];'
            + '[0:v]'+mid2+'rotate='+rotateAngle+':fillcolor=0x'+bgHex
            + ':ow=rotw('+rotateAngle+'):oh=roth('+rotateAngle+')'
            + ',scale=w=540:h=960:force_original_aspect_ratio=decrease'
            + ',pad=540:960:(540-iw)/2:(960-ih)/2:0x'+bgHex+'[rot2];'
            // shortest=1 : sans ça, color= est une source infinie (pas de
            // durée propre) et overlay répète sa dernière frame indéfiniment
            // une fois la vidéo terminée — l'encodage tournait à l'infini
            // (testé : toujours en cours après 10 min, fichier final corrompu
            // car tué par le timeout serveur).
            + '[bg2][rot2]overlay=(W-w)/2:(H-h)/2:shortest=1'
            + ',scale=iw*'+sf+':ih*'+sf
            + ',pad=iw*'+inv+':ih*'+inv+':(ow-iw)/2:(oh-ih)/2:0x'+bgHex
            + ',format=yuv420p[out2]';
      } else {
        // Même correction que pour le fond flouté : normaliser à 540:960
        // avant d'appliquer le facteur de rétrécissement.
        // shortest=1 : sans ça, color= est une source infinie et overlay
        // tourne indéfiniment une fois la vidéo terminée (voir commentaire
        // plus haut, même bug, vérifié en testant — ffmpeg ne s'arrêtait
        // jamais tout seul).
        fc2 = 'color=c=0x'+bgHex+':size=540x960[bg2];'
            + '[0:v]'+mid2+'scale=w=540:h=960:force_original_aspect_ratio=decrease,pad=540:960:(540-iw)/2:(960-ih)/2:0x'+bgHex+',scale=iw*'+sf+':ih*'+sf+'[sm2];'
            + '[bg2][sm2]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[out2]';
      }
      args = ['-y', ...trimArgs, '-i', inputFile,
        '-filter_complex', fc2,
        '-map', '[out2]', '-map', '0:a?',
        ...encodeArgs, ...meta, outputFile];
    }
  } else if(rotateAngle){
    // Même bug que le rétrécir : [fg] doit être ramené à 540:960 avant le
    // pad*1.2/rotate/crop, sinon il reste à la résolution d'origine (ex.
    // 1080x1920), recouvre entièrement le canevas de fond flouté, et la
    // bordure n'apparaît jamais.
    // fillcolor=black@0 (transparent) ne sert à rien sans canal alpha sur
    // le flux — yuv420p n'en a pas, donc "transparent" devenait du noir
    // opaque (le fond flouté ne pouvait jamais apparaître dans les coins).
    // format=yuva420p avant le pad/rotate donne ce canal alpha, et le pad
    // d'origine passe aussi en transparent (au lieu d'opaque) pour ne pas
    // lui-même cacher le fond.
    const mid = cleanFilter ? cleanFilter+',' : '';
    const fc = 'split=2[bg][fg];[bg]scale=w=600:h=1060:force_original_aspect_ratio=increase,crop=600:1060,boxblur=20:5,crop=540:960[blurred];'
      + '[fg]'+mid+'scale=w=540:h=960:force_original_aspect_ratio=decrease,format=yuva420p,pad=540:960:(540-iw)/2:(960-ih)/2:black@0,pad=iw*1.2:ih*1.2:(ow-iw)/2:(oh-ih)/2:black@0,rotate='+rotateAngle+':fillcolor=black@0:ow=iw:oh=ih,crop=iw/1.2:ih/1.2[rotated];'
      + '[blurred][rotated]overlay=(W-w)/2:(H-h)/2,format=yuv420p[out]';
    args = ['-y', ...trimArgs, '-i', inputFile,
      '-filter_complex', fc,
      '-map', '[out]', '-map', '0:a?',
      ...encodeArgs, ...meta, outputFile];
  } else {
    const vf = [cleanFilter, 'format=yuv420p'].filter(Boolean).join(',');
    args = ['-y', ...trimArgs, '-i', inputFile,
      '-vf', vf, ...encodeArgs, ...meta, outputFile];
  }

  // Ajuste le tempo audio pour rester synchro avec la vidéo accélérée/ralentie.
  // Ignoré si une musique remplace/mixe l'audio (le filtre audio dédié à la musique prévaut).
  if(speedFactor && !(musicFile && fs.existsSync(musicFile))){
    args.splice(args.length - 1, 0, '-filter:a', 'atempo=' + speedFactor);
  }

  // ── Audio musique ─────────────────────────────────────────────
  // (géré séparément si musicFile présent - simple remplacement/mix audio)
  if(musicFile && fs.existsSync(musicFile)){
    const mVol = (musicVol !== undefined ? musicVol : 80) / 100;
    const oVol = (origVol  !== undefined ? origVol  : 50) / 100;
    const iIdx = args.indexOf('-i');
    if(musicMode === 'mix'){
      args.splice(iIdx+2, 0, '-i', musicFile);
      args.splice(args.indexOf('-c:v'), 0,
        '-filter_complex', '[0:a]volume='+oVol+'[a0];[1:a]volume='+mVol+',aloop=loop=-1:size=2e+09[a1];[a0][a1]amix=inputs=2:duration=first[aout]',
        '-map', '0:v', '-map', '[aout]'
      );
    } else {
      args.splice(iIdx+2, 0, '-i', musicFile);
      args.splice(args.indexOf('-c:a'), 0,
        '-filter_complex', '[1:a]volume='+mVol+',aloop=loop=-1:size=2e+09[aout]',
        '-map', '0:v', '-map', '[aout]', '-shortest'
      );
    }
  }

  // ── Exécuter ─────────────────────────────────────────────────
  // spawn (pas execFileSync) + "-progress pipe:1" pour recevoir la
  // progression de l'encodage en direct (out_time_ms) plutôt que de
  // bloquer en silence jusqu'à la fin du fichier — avant ça, la barre
  // de progression ne bougeait qu'une fois par variante terminée.
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const fullArgs = ['-progress', 'pipe:1', '-nostats', ...args];
    console.log('=== CMD COMPLÈTE ===');
    console.log(FFMPEG_BIN, fullArgs.join(' '));
    console.log('===================');

    const proc = spawn(FFMPEG_BIN, fullArgs, { windowsHide: true });
    let stderrFull = '';
    let buf = '';
    const timeoutMs = 600000;
    const killTimer = setTimeout(() => { try{ proc.kill('SIGKILL'); }catch{} }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop(); // ligne incomplète, on la garde pour le prochain chunk
      for(const line of lines){
        const m = line.match(/^out_time_ms=(\d+)/);
        if(m && onProgress && inputDuration > 0){
          const fraction = Math.min(1, (parseInt(m[1], 10) / 1e6) / inputDuration);
          onProgress(fraction);
        }
      }
    });
    proc.stderr.on('data', (chunk) => {
      // Pas de slice ici : un message d'erreur ffmpeg utile peut largement
      // dépasser 500 caractères (filtres complexes, chemins longs...) — le
      // tronquer à la volée masquait la vraie cause de l'échec dans les logs.
      stderrFull += chunk.toString();
    });
    const cleanup = () => {
      clearTimeout(killTimer);
      if(srtPath) try{ fs.unlinkSync(srtPath); }catch{}
    };
    // Si l'encodage échoue, ffmpeg a pu écrire un fichier de sortie partiel
    // (en-tête présent mais frames manquantes) — un fichier au nom normal
    // qui semble correct mais ne s'ouvre dans aucun lecteur. Le supprimer
    // pour ne jamais laisser un fichier corrompu se faire passer pour une
    // variante réussie.
    const removeBrokenOutput = () => {
      try{ if(fs.existsSync(outputFile)) fs.unlinkSync(outputFile); }catch{}
    };
    proc.on('error', (e) => {
      cleanup();
      removeBrokenOutput();
      console.error('FFmpeg spawn error:', e.message);
      resolve(false);
    });
    proc.on('close', (code) => {
      cleanup();
      if(code === 0){
        if(onProgress) onProgress(1);
        resolve(true);
      } else {
        removeBrokenOutput();
        console.error('FFmpeg error (code '+code+'):', stderrFull.slice(-1500));
        resolve(false);
      }
    });
  });
}

function bgMode(m){ return (m||'blur') === 'blur' ? 'blur' : 'color'; }


// ── MULTIPART PARSER ──────────────────────────────────────────

function parseMultipart(body, boundary){
  const parts = [];
  const sep   = Buffer.from('\r\n--'+boundary);
  const start = Buffer.from('--'+boundary+'\r\n');
  let pos = body.indexOf(start);
  if(pos === -1) return parts;
  pos += start.length;
  while(true){
    const nextSep = body.indexOf(sep, pos);
    if(nextSep === -1) break;
    const part    = body.slice(pos, nextSep);
    const headEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if(headEnd === -1){ pos = nextSep+sep.length+2; continue; }
    const headers   = part.slice(0,headEnd).toString('utf8');
    const content   = part.slice(headEnd+4);
    const nameMatch = headers.match(/name="([^"]+)"/);
    const fileMatch = headers.match(/filename="([^"]+)"/);
    if(nameMatch) parts.push({ name:nameMatch[1], filename:fileMatch?fileMatch[1]:null, data:content });
    pos = nextSep+sep.length+2;
  }
  return parts;
}

// ── HTTP SERVER ───────────────────────────────────────────────

const server = http.createServer((req, res) => {

  if(req.url === '/' || req.url === '/index.html'){
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    return;
  }

  // Font status
  if(req.url === '/font-status'){
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({ready: notoFontReady, path: FONT_PATH}));
    return;
  }

  if(req.url === '/check-ffmpeg'){
    try {
      const out = execSync(FFMPEG_CMD+' -version', {stdio:'pipe'}).toString();
      const v   = (out.match(/ffmpeg version ([^\s]+)/)||[])[1]||'?';
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true,version:v}));
    } catch {
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:false}));
    }
    return;
  }

  // Convert MOV → MP4
  if(req.url === '/convert' && req.method === 'POST'){
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Transfer-Encoding':'chunked','Cache-Control':'no-cache'});
    const chunks = [];
    req.on('data', c=>chunks.push(c));
    req.on('end', ()=>{
      try {
        const body   = Buffer.concat(chunks);
        const bMatch = (req.headers['content-type']||'').match(/boundary=([^\s;]+)/);
        if(!bMatch){ res.end(); return; }
        const parts  = parseMultipart(body, bMatch[1]);
        const outDir = path.join(os.homedir(),'Desktop','Norys Reels Output');
        if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
        for(const p of parts){
          if(p.name==='video' && p.filename){
            const ext     = path.extname(p.filename)||'.mov';
            const tmp     = path.join(os.tmpdir(),'conv_'+Date.now()+ext);
            fs.writeFileSync(tmp, p.data);
            const outName = path.basename(p.filename,ext)+'_converted.mp4';
            const outPath = path.join(outDir,outName);
            send(res,{type:'start',file:outName});
            try {
              const cmd = FFMPEG_CMD+' -y -i "'+tmp+'" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" -c:v libx264 -profile:v high -level 4.0 -crf 21 -preset slow -maxrate 6M -bufsize 12M -r 30 -c:a aac -ar 48000 -b:a 192k -movflags +faststart "'+outPath+'"';
              execSync(cmd,{stdio:'pipe',timeout:300000});
              const size = (fs.statSync(outPath).size/1024/1024).toFixed(1);
              send(res,{type:'done',file:outName,size,path:outPath});
            } catch(e){ send(res,{type:'error',msg:e.message.substring(0,200)}); }
            try{ fs.unlinkSync(tmp); }catch{}
          }
        }
        res.end();
      } catch(e){ send(res,{type:'error',msg:e.message}); res.end(); }
    });
    return;
  }

  // Generate variants
  if(req.url === '/generate' && req.method === 'POST'){
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Transfer-Encoding':'chunked','Cache-Control':'no-cache'});
    const chunks = [];
    req.on('data', c=>chunks.push(c));
    req.on('end', async ()=>{
      try {
        const body   = Buffer.concat(chunks);
        const bMatch = (req.headers['content-type']||'').match(/boundary=([^\s;]+)/);
        if(!bMatch){ res.end(); return; }
        const parts = parseMultipart(body, bMatch[1]);

        let numVariants  = 10;
        let outputDir    = path.join(os.homedir(),'Desktop','Norys Reels Output');
        let filters      = [];
        let combineMode  = false;
        let captionText  = '';
        let captionStyle = {};
        let shrinkBgMode  = 'blur';
        let shrinkBgColor = '#ff69b4';
        let musicMode    = 'replace';
        let musicVol     = 80;
        let origVol      = 50;
        let musicTmp     = null;
        let injectMetadata = true;
        let deviceModelId   = 'random';
        let gpsCountry       = 'random';
        let namingMode       = 'sequential';
        let outputFormat     = 'mp4';
        const tmpFiles   = [];

        for(const p of parts){
          const val = p.data.toString('utf8').trim();
          if     (p.name==='numVariants')   numVariants = parseInt(val)||10;
          else if(p.name==='outputDir')     { if(val!=='desktop'&&val) outputDir=val; }
          else if(p.name==='filters')       { try{ filters=JSON.parse(val); }catch{} }
          else if(p.name==='combineMode')   combineMode = val==='1';
          else if(p.name==='captionText')   captionText = val;
          else if(p.name==='captionStyle')  { try{ captionStyle=JSON.parse(val); }catch{} }
          else if(p.name==='shrinkBgMode')  shrinkBgMode  = val;
          else if(p.name==='shrinkBgColor') shrinkBgColor = val;
          else if(p.name==='musicMode')   musicMode = val;
          else if(p.name==='musicVol')    musicVol  = Math.max(0, Math.min(100, parseInt(val)||80));
          else if(p.name==='origVol')     origVol   = Math.max(0, Math.min(100, parseInt(val)||50));
          else if(p.name==='injectMetadata') injectMetadata = val === '1';
          else if(p.name==='deviceModelId')  deviceModelId  = val || 'random';
          else if(p.name==='gpsCountry')     gpsCountry     = val || 'random';
          else if(p.name==='namingMode')     namingMode     = (val === 'random') ? 'random' : 'sequential';
          else if(p.name==='outputFormat')   outputFormat   = (val === 'mov') ? 'mov' : 'mp4';
          else if(p.name==='musicFile' && p.filename){
            const ext = path.extname(p.filename) || '.mp3';
            musicTmp = path.join(os.tmpdir(), 'nmusic_'+Date.now()+ext);
            fs.writeFileSync(musicTmp, p.data);
            console.log('Music saved: '+musicTmp+' ('+p.data.length+' bytes)');
          }
          else if(p.name==='videos' && p.filename){
            const ext = path.extname(p.filename)||'.mp4';
            const tmp = path.join(os.tmpdir(),'nreels_'+Date.now()+'_'+Math.random().toString(36).slice(2)+ext);
            fs.writeFileSync(tmp, p.data);
            tmpFiles.push({tmp, name:p.filename});
            console.log('Saved temp: '+tmp+' ('+p.data.length+' bytes)');
          }
        }

        if(!filters.length) filters=[{id:'clean',filter:''}];
        if(!fs.existsSync(outputDir)) fs.mkdirSync(outputDir,{recursive:true});

        const captionLines = captionText
          ? captionText.split('\n').map(l=>l.trim()).filter(Boolean).map(text=>({text}))
          : [];

        // Chaque variante produit 3 fichiers : original, miroir horizontal (_mh), miroir vertical (_mv)
        const MIRROR_VARIANTS = [['', null], ['_mh', 'hflip'], ['_mv', 'vflip']];
        const total = tmpFiles.length * numVariants * 3;
        send(res,{type:'start',total});
        console.log('Generating '+total+' files ('+numVariants+' variants × 3 mirrors) → '+outputDir);

        let success = 0;
        let seqIdx   = 0;  // numéro de variante de base (sans les miroirs)
        let globalIdx = 0; // index global sur tous les fichiers (pour la progression)
        for(const vf of tmpFiles){
          const base = path.basename(vf.name, path.extname(vf.name));
          for(let i=0; i<numVariants; i++){
            let tplId, combinedFilter, combinedSpecial;

            // ── NOUVEAU MODE : chaque variante combine TOUS les filtres actifs ──
            // Chaque filtre contribue avec sa valeur randomisée → combinaison unique
            // Les specials (shrink, randcut...) sont appliqués si présents
            const filterParts    = [];
            const specialsFound  = [];
            const tplIds         = [];

            // Mélanger les filtres aléatoirement à chaque variante
            const shuffled = [...filters].sort(() => Math.random() - 0.5);

            for(const tpl of shuffled){
              tplIds.push(tpl.id);
              if(tpl.special && tpl.special !== 'reverse'){
                if(!specialsFound.length) specialsFound.push(tpl.special);
              } else if(tpl.filter){
                const randomized = randomizeFilter(tpl.filter);
                if(randomized) filterParts.push(randomized);
              }
            }

            // Séparer les filtres normaux des filtres __rotate__ (qui nécessitent filter_complex)
            const normalParts = [];
            let rotateAngle = null;
            for(const p of filterParts){
              const rm = p.match(/^__rotate__(-?[\d.]+)$/);
              if(rm) rotateAngle = rm[1];
              else normalParts.push(p);
            }

            // Ajouter __rotate__ dans le filter string pour que generateVariant le détecte
            if(rotateAngle) normalParts.push('__rotate__' + rotateAngle);
            combinedFilter  = normalParts.join(',');
            // Retirer hflip/vflip explicites — désormais gérés comme multiplicateurs
            combinedFilter  = combinedFilter.replace(/,?(hflip|vflip),?/g, ',').replace(/^,|,$/g,'');
            combinedSpecial = specialsFound[0] || '';
            tplId = 'all'+filters.length+'f';

            const ext     = outputFormat === 'mov' ? '.mov' : '.mp4';
            const seqNum  = String(seqIdx+1).padStart(3,'0');
            const randBase = Math.random().toString(16).slice(2,10);
            const metaOpts = { injectMetadata, deviceModelId, gpsCountry };

            // Générer l'original + miroir horizontal + miroir vertical
            for(const [suffix, mirrorFilter] of MIRROR_VARIANTS){
              const thisAttemptIndex = globalIdx++;
              const outName = namingMode === 'random'
                ? base+'_'+randBase+suffix+ext
                : 'variant_'+seqNum+suffix+ext;
              const outPath = path.join(outputDir, outName);
              const thisFilter = mirrorFilter
                ? (combinedFilter ? combinedFilter+','+mirrorFilter : mirrorFilter)
                : combinedFilter;
              console.log('['+(i+1)+'/'+numVariants+']'+suffix+' '+tplId+' → '+outName);

              let lastSentPct = -1;
              const ok = await generateVariant(vf.tmp, outPath, thisFilter, combinedSpecial, captionLines, captionStyle, musicTmp, musicMode, musicVol, origVol, shrinkBgMode, shrinkBgColor, metaOpts, (fraction) => {
                const pct = Math.round(((thisAttemptIndex + fraction) / total) * 100);
                if(pct !== lastSentPct){ lastSentPct = pct; send(res,{type:'subprogress',pct}); }
              });
              if(ok){ success++; send(res,{type:'progress',file:outName}); }
              else { send(res,{type:'error',file:outName,msg:'FFmpeg error'}); }
            }
            seqIdx++;
          }
          try{ fs.unlinkSync(vf.tmp); }catch{}
        }

        if(musicTmp) try{ fs.unlinkSync(musicTmp); }catch{}
        send(res,{type:'done',success,total,outputDir});
        res.end();
      } catch(err){
        console.error('Server error:', err);
        send(res,{type:'error',file:'',msg:err.message});
        res.end();
      }
    });
    return;
  }


  // ── Import police custom ─────────────────────────────────────
  if(req.url === '/upload-font' && req.method === 'POST'){
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const ct   = req.headers['content-type'] || '';
        const bMatch = ct.match(/boundary=([^\s;]+)/);
        if(!bMatch){ res.writeHead(400); res.end('no boundary'); return; }
        const parts = parseMultipart(body, bMatch[1]);
        const filePart = parts.find(p => p.name === 'font');
        if(!filePart || !filePart.filename){ res.writeHead(400); res.end('no font file'); return; }
        const ext = path.extname(filePart.filename).toLowerCase();
        if(!['.ttf','.otf'].includes(ext)){ res.writeHead(400); res.end('format invalide'); return; }
        const safeName = filePart.filename.replace(/[^a-zA-Z0-9._-]/g,'_');
        const destPath = path.join(FONT_DIR, safeName);
        if(!fs.existsSync(FONT_DIR)) fs.mkdirSync(FONT_DIR, {recursive:true});
        fs.writeFileSync(destPath, filePart.data);
        const assName = path.basename(safeName, ext);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ ok:true, key:'custom_'+assName, assName, file:safeName }));
      } catch(e){ res.writeHead(500); res.end(e.message); }
    });
    return;
  }

  // ── Export vidéo avec sous-titres uniquement (sans duplication) ──
  if(req.url === '/export-captions' && req.method === 'POST'){
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Transfer-Encoding':'chunked','Cache-Control':'no-cache'});
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const body   = Buffer.concat(chunks);
        const bMatch = (req.headers['content-type']||'').match(/boundary=([^\s;]+)/);
        if(!bMatch){ res.end(); return; }
        const parts = parseMultipart(body, bMatch[1]);

        let captionText  = '';
        let captionStyle = {};
        const tmpFiles   = [];

        for(const p of parts){
          const val = p.data.toString('utf8').trim();
          if(p.name==='captionText')   captionText  = val;
          else if(p.name==='captionStyle'){ try{ captionStyle=JSON.parse(val); }catch{} }
          else if(p.name==='videos' && p.filename){
            const ext = path.extname(p.filename)||'.mp4';
            const tmp = path.join(os.tmpdir(),'nexport_'+Date.now()+'_'+Math.random().toString(36).slice(2)+ext);
            fs.writeFileSync(tmp, p.data);
            tmpFiles.push({tmp, name:p.filename});
          }
        }

        const captionLines = captionText
          ? captionText.split('\n').map(l=>l.trim()).filter(Boolean).map(text=>({text}))
          : [];

        const outDir = path.join(os.homedir(),'Desktop','Norys Reels Output');
        if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});

        for(const vf of tmpFiles){
          const base    = path.basename(vf.name, path.extname(vf.name));
          const outName = base + '_subtitled.mp4';
          const outPath = path.join(outDir, outName);

          send(res, {type:'progress', file: outName});

          // Générer avec filtre clean (pas de modification visuelle) + sous-titres
          const ok = await generateVariant(vf.tmp, outPath, '', '', captionLines, captionStyle);

          if(ok){
            const size = (fs.statSync(outPath).size/1024/1024).toFixed(1);
            send(res, {type:'done', file:outName, size});
          } else {
            send(res, {type:'error', msg:'Erreur FFmpeg — vérifie que libass est installé'});
          }
          try{ fs.unlinkSync(vf.tmp); }catch{}
        }
        res.end();
      } catch(err){
        send(res,{type:'error',msg:err.message});
        res.end();
      }
    });
    return;
  }


  // Fichiers statiques scopés à vendor/ et fonts/ (lecture seule, pas de logique métier)
  if(req.method === 'GET' && /^\/(vendor|fonts)\//.test(req.url)){
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.normalize(path.join(__dirname, rel));
    if(filePath.startsWith(__dirname) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()){
      const ext = path.extname(filePath).toLowerCase();
      const types = { '.js':'text/javascript', '.ttf':'font/ttf', '.css':'text/css' };
      res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream'});
      res.end(fs.readFileSync(filePath));
      return;
    }
  }

  res.writeHead(404); res.end('Not found');
});

function send(res,obj){ try{ res.write(JSON.stringify(obj)+'\n'); }catch{} }

// Télécharger les fonts au démarrage (async, non-bloquant)
downloadFont();
downloadMontserrat();
downloadExtraFonts();

server.on('error', (e) => {
  if(e.code === 'EADDRINUSE'){
    console.log('⚠️  Port '+PORT+' déjà utilisé — tentative de libération...');
    // Sur Windows : tuer le process qui utilise le port
    try {
      const { execSync } = require('child_process');
      const platform = require('os').platform();
      if(platform === 'win32'){
        // Trouver le PID qui utilise le port
        const out = execSync('netstat -ano | findstr :'+PORT, {stdio:'pipe'}).toString();
        const lines = out.trim().split('\n').filter(l => l.includes('LISTENING'));
        const pids  = [...new Set(lines.map(l => l.trim().split(/\s+/).pop()))].filter(Boolean);
        pids.forEach(pid => {
          try { execSync('taskkill /PID '+pid+' /F', {stdio:'pipe'}); console.log('  ✅ Process '+pid+' terminé'); }
          catch{}
        });
      } else {
        execSync('fuser -k '+PORT+'/tcp', {stdio:'pipe'});
      }
      // Réessayer après 1 seconde
      setTimeout(() => server.listen(PORT), 1000);
    } catch(err){
      console.error('❌ Impossible de libérer le port. Ferme le terminal précédent manuellement.');
      process.exit(1);
    }
  } else {
    console.error('❌ Erreur serveur:', e.message);
    process.exit(1);
  }
});

server.listen(PORT, ()=>{
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║       Norys Reels — Démarré ✓         ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('\n🌐 http://localhost:'+PORT+'\n');
  console.log('Ctrl+C pour arrêter\n');
  if(process.env.NORYS_ELECTRON === '1') return; // fenêtre Electron déjà ouverte, pas besoin du navigateur
  try {
    const p = os.platform();
    if(p==='win32') execSync('start http://localhost:'+PORT,{stdio:'ignore'});
    else if(p==='darwin') execSync('open http://localhost:'+PORT,{stdio:'ignore'});
    else execSync('xdg-open http://localhost:'+PORT,{stdio:'ignore'});
  } catch{}
});
