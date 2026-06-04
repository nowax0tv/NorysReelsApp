#!/usr/bin/env node
// ============================================================
//  NorysTracking — Reels Duplicator
//  Génère N variantes uniques d'une vidéo via FFmpeg
//  Chaque variante a une signature binaire différente
// ============================================================

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── CONFIG ───────────────────────────────────────────────────
const INPUT_DIR  = './input';
const OUTPUT_DIR = './output';

// Nombre de variantes : argument CLI ou valeur par défaut
// Usage : node duplicate.js 60
// Usage : node duplicate.js 200
// Usage : node duplicate.js (utilise 10 par défaut)
const NUM_VARIANTS = parseInt(process.argv[2]) || 10;

// ── APPAREILS SIMULÉS (modèles populaires aux US) ────────────
const DEVICES = [
  { make:'Apple',   model:'iPhone 15 Pro Max',  software:'17.4.0' },
  { make:'Apple',   model:'iPhone 15 Pro',      software:'17.3.1' },
  { make:'Apple',   model:'iPhone 15',          software:'17.4.0' },
  { make:'Apple',   model:'iPhone 14 Pro Max',  software:'17.2.1' },
  { make:'Apple',   model:'iPhone 14 Pro',      software:'17.1.2' },
  { make:'Apple',   model:'iPhone 13 Pro Max',  software:'17.0.3' },
  { make:'Samsung', model:'SM-S928U',           software:'14'     }, // Galaxy S24 Ultra US
  { make:'Samsung', model:'SM-S921U',           software:'14'     }, // Galaxy S24 US
  { make:'Samsung', model:'SM-S918U',           software:'14'     }, // Galaxy S23 Ultra US
  { make:'Samsung', model:'SM-F946U',           software:'14'     }, // Galaxy Z Fold5 US
  { make:'Google',  model:'Pixel 8 Pro',        software:'14'     },
  { make:'Google',  model:'Pixel 8',            software:'14'     },
  { make:'Google',  model:'Pixel 7 Pro',        software:'14'     },
  { make:'OnePlus', model:'CPH2449',            software:'14'     }, // OnePlus 12
];

// ── LIEUX SIMULÉS (coordonnées GPS réalistes - US) ────────────
const LOCATIONS = [
  { lat:'34.0522',  lon:'-118.2437', city:'Los Angeles'   },
  { lat:'40.7128',  lon:'-74.0060',  city:'New York'      },
  { lat:'41.8781',  lon:'-87.6298',  city:'Chicago'       },
  { lat:'29.7604',  lon:'-95.3698',  city:'Houston'       },
  { lat:'33.4484',  lon:'-112.0740', city:'Phoenix'       },
  { lat:'29.4241',  lon:'-98.4936',  city:'San Antonio'   },
  { lat:'32.7767',  lon:'-96.7970',  city:'Dallas'        },
  { lat:'30.3322',  lon:'-81.6557',  city:'Jacksonville'  },
  { lat:'30.2672',  lon:'-97.7431',  city:'Austin'        },
  { lat:'37.7749',  lon:'-122.4194', city:'San Francisco' },
  { lat:'47.6062',  lon:'-122.3321', city:'Seattle'       },
  { lat:'25.7617',  lon:'-80.1918',  city:'Miami'         },
  { lat:'36.1699',  lon:'-115.1398', city:'Las Vegas'     },
  { lat:'33.7490',  lon:'-84.3880',  city:'Atlanta'       },
  { lat:'42.3601',  lon:'-71.0589',  city:'Boston'        },
  { lat:'45.5152',  lon:'-122.6784', city:'Portland'      },
  { lat:'35.4676',  lon:'-97.5164',  city:'Oklahoma City' },
  { lat:'39.9526',  lon:'-75.1652',  city:'Philadelphia'  },
  { lat:'36.1627',  lon:'-86.7816',  city:'Nashville'     },
  { lat:'32.2226',  lon:'-110.9747', city:'Tucson'        },
];

// ── TEMPLATES DE TRANSFORMATION ──────────────────────────────
// Chaque template applique un filtre FFmpeg différent
const TEMPLATES = [
  {
    name: 'original_clean',
    description: 'Re-encode propre sans modification visuelle',
    filter: '', // Juste re-encode
  },
  {
    name: 'noir_et_blanc',
    description: 'Noir et blanc avec grain de film',
    filter: 'hue=s=0,curves=all=\'0/0 0.5/0.5 1/1\',noise=alls=3:allf=t+u',
  },
  {
    name: 'contraste_boost',
    description: 'Contraste légèrement boosté',
    filter: 'eq=contrast=1.08:brightness=0.02:saturation=1.05',
  },
  {
    name: 'warm_tone',
    description: 'Tons chauds (légèrement orangé)',
    filter: 'colorbalance=rs=0.05:gs=-0.02:bs=-0.05:rm=0.03:gm=-0.01:bm=-0.03',
  },
  {
    name: 'cool_tone',
    description: 'Tons froids (légèrement bleuté)',
    filter: 'colorbalance=rs=-0.04:gs=0.01:bs=0.06:rm=-0.02:gm=0.01:bm=0.04',
  },
  {
    name: 'vignette',
    description: 'Vignette subtile sur les bords',
    filter: 'vignette=PI/4',
  },
  {
    name: 'sharpen',
    description: 'Légèrement plus net',
    filter: 'unsharp=5:5:0.8:5:5:0.0',
  },
  {
    name: 'film_grain',
    description: 'Grain de film cinéma',
    filter: 'noise=alls=4:allf=t+u',
  },
  {
    name: 'slight_zoom',
    description: 'Zoom subtil 2% (change le cadrage)',
    filter: 'scale=iw*1.02:ih*1.02,crop=iw/1.02:ih/1.02',
  },
  {
    name: 'mirror_flip',
    description: 'Miroir horizontal léger (hflip)',
    filter: 'hflip',
  },
  {
    name: 'brightness_down',
    description: 'Légèrement plus sombre',
    filter: 'eq=brightness=-0.04:contrast=1.03',
  },
  {
    name: 'saturation_boost',
    description: 'Couleurs plus saturées',
    filter: 'eq=saturation=1.15',
  },
];

// ── UTILS ─────────────────────────────────────────────────────
function rand(min, max){ return Math.random() * (max - min) + min; }
function randInt(min, max){ return Math.floor(rand(min, max)); }
function pick(arr){ return arr[randInt(0, arr.length)]; }

function randomDate(){
  const now = new Date();
  const daysAgo = randInt(1, 30);
  const d = new Date(now - daysAgo * 86400000);
  const h = randInt(9, 22);
  const m = randInt(0, 59);
  const s = randInt(0, 59);
  return `${d.getFullYear()}:${String(d.getMonth()+1).padStart(2,'0')}:${String(d.getDate()).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function checkFFmpeg(){
  try {
    execSync('ffmpeg -version', { stdio:'pipe' });
    return true;
  } catch(e) {
    return false;
  }
}

// ── GÉNÉRATION D'UNE VARIANTE ─────────────────────────────────
function generateVariant(inputFile, outputFile, template, variantIndex){
  const device   = pick(DEVICES);
  const location = pick(LOCATIONS);
  const date     = randomDate();
  
  // CRF légèrement différent à chaque fois (qualité imperceptiblement différente)
  const crf = randInt(22, 26);
  
  // Preset légèrement différent
  const presets = ['medium', 'slow', 'fast'];
  const preset = pick(presets);

  // Construire la commande FFmpeg
  let videoFilter = template.filter 
    ? `-vf "${template.filter}"`
    : '';

  // Métadonnées d'appareil réalistes
  const metadata = [
    `-metadata:s:v:0 creation_time="${date}"`,
    `-metadata make="${device.make}"`,
    `-metadata model="${device.model}"`,
    `-metadata software="${device.software}"`,
    `-metadata location="${location.lat}+${location.lon}/"`,
    `-metadata location-eng="${location.city}"`,
    `-metadata date="${date.split(' ')[0].replace(/:/g,'-')}"`,
    `-metadata comment=""`,
    `-metadata description=""`,
    `-metadata title=""`,
  ].join(' ');

  const cmd = [
    'ffmpeg -y',
    `-i "${inputFile}"`,
    videoFilter,
    `-c:v libx264`,
    `-crf ${crf}`,
    `-preset ${preset}`,
    `-c:a aac`,
    `-b:a ${pick(['128k','192k','160k'])}`,
    `-movflags +faststart`,
    `-map_metadata -1`,  // Supprimer les métadonnées originales
    metadata,
    `"${outputFile}"`,
  ].filter(Boolean).join(' ');

  try {
    execSync(cmd, { stdio:'pipe' });
    return true;
  } catch(e) {
    console.error(`  ❌ Erreur: ${e.message}`);
    return false;
  }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main(){
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║     NorysTracking Reels Duplicator    ║');
  console.log('╚═══════════════════════════════════════╝\n');

  // Vérifier FFmpeg
  if (!checkFFmpeg()){
    console.error('❌ FFmpeg non trouvé!\n');
    console.error('Installe-le :');
    console.error('  Windows : https://ffmpeg.org/download.html → ajouter au PATH');
    console.error('  Mac     : brew install ffmpeg');
    console.error('  Linux   : sudo apt install ffmpeg\n');
    process.exit(1);
  }
  console.log('✅ FFmpeg détecté\n');

  // Créer les dossiers
  if (!fs.existsSync(INPUT_DIR)){
    fs.mkdirSync(INPUT_DIR, { recursive:true });
    console.log(`📁 Dossier créé : ${INPUT_DIR}`);
    console.log('   → Mets tes vidéos MP4 dans ce dossier puis relance le script\n');
    return;
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive:true });

  // Trouver les vidéos
  const videos = fs.readdirSync(INPUT_DIR)
    .filter(f => /\.(mp4|mov|avi|mkv|webm)$/i.test(f));

  if (!videos.length){
    console.log(`❌ Aucune vidéo trouvée dans ./${INPUT_DIR}`);
    console.log('   → Ajoute des fichiers .mp4 ou .mov et relance\n');
    return;
  }

  console.log(`🎬 ${videos.length} vidéo(s) trouvée(s)`);
  console.log(`🔄 Génération de ${NUM_VARIANTS} variante(s) par vidéo`);
  console.log(`   (Pour changer : node duplicate.js 60)\n`);

  let totalSuccess = 0;
  let totalFail = 0;

  for (const videoFile of videos){
    const inputPath = path.join(INPUT_DIR, videoFile);
    const baseName = path.basename(videoFile, path.extname(videoFile));

    console.log(`\n📹 Traitement : ${videoFile}`);
    console.log('─'.repeat(50));

    // Sélectionner les templates - si NUM_VARIANTS > templates, on répète avec variations
    const selected = [];
    for (let i = 0; i < NUM_VARIANTS; i++) {
      const template = TEMPLATES[i % TEMPLATES.length];
      // Pour les répétitions, on clone le template pour que les params CRF/appareil soient différents
      selected.push({...template, _pass: Math.floor(i / TEMPLATES.length)});
    }
    // Mélanger pour varier l'ordre
    selected.sort(() => Math.random() - 0.5);

    for (let i = 0; i < selected.length; i++){
      const template = selected[i];
      const outputName = `${baseName}_v${String(i+1).padStart(2,'0')}_${template.name}.mp4`;
      const outputPath = path.join(OUTPUT_DIR, outputName);

      process.stdout.write(`  [${i+1}/${selected.length}] ${template.description}... `);

      const ok = generateVariant(inputPath, outputPath, template, i);
      
      if (ok){
        const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
        console.log(`✅ (${size}MB)`);
        totalSuccess++;
      } else {
        console.log('❌');
        totalFail++;
      }
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ ${totalSuccess} variante(s) générée(s)`);
  if (totalFail > 0) console.log(`❌ ${totalFail} échec(s)`);
  console.log(`📂 Résultat dans : ./${OUTPUT_DIR}/`);
  console.log('═'.repeat(50) + '\n');
}

main().catch(console.error);
