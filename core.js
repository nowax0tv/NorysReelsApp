#!/usr/bin/env node
// ============================================================
//  Norys Reels — CLI Duplicator
//  Génère N variantes uniques d'une vidéo via FFmpeg
//  Specs optimisées Instagram : CRF 18, H.264 High, 30fps, 48kHz
//
//  Usage :
//    node core.js          → 10 variantes
//    node core.js 60       → 60 variantes
//    node core.js 200      → 200 variantes
// ============================================================

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const INPUT_DIR    = './input';
const OUTPUT_DIR   = './output';
const NUM_VARIANTS = parseInt(process.argv[2]) || 10;

// ── APPAREILS SIMULÉS ─────────────────────────────────────────
const DEVICES = [
  { make:'Apple',   model:'iPhone 15 Pro Max',  software:'17.4.0' },
  { make:'Apple',   model:'iPhone 15 Pro',      software:'17.3.1' },
  { make:'Apple',   model:'iPhone 15',          software:'17.4.0' },
  { make:'Apple',   model:'iPhone 14 Pro Max',  software:'17.2.1' },
  { make:'Apple',   model:'iPhone 14 Pro',      software:'17.1.2' },
  { make:'Apple',   model:'iPhone 13 Pro Max',  software:'17.0.3' },
  { make:'Samsung', model:'SM-S928U',           software:'14'     },
  { make:'Samsung', model:'SM-S921U',           software:'14'     },
  { make:'Samsung', model:'SM-S918U',           software:'14'     },
  { make:'Samsung', model:'SM-F946U',           software:'14'     },
  { make:'Google',  model:'Pixel 8 Pro',        software:'14'     },
  { make:'Google',  model:'Pixel 8',            software:'14'     },
  { make:'Google',  model:'Pixel 7 Pro',        software:'14'     },
  { make:'OnePlus', model:'CPH2449',            software:'14'     },
];

// ── LIEUX SIMULÉS (US) ────────────────────────────────────────
const LOCATIONS = [
  { lat:'34.0522',  lon:'-118.2437', city:'Los Angeles'   },
  { lat:'40.7128',  lon:'-74.0060',  city:'New York'      },
  { lat:'41.8781',  lon:'-87.6298',  city:'Chicago'       },
  { lat:'29.7604',  lon:'-95.3698',  city:'Houston'       },
  { lat:'33.4484',  lon:'-112.0740', city:'Phoenix'       },
  { lat:'29.4241',  lon:'-98.4936',  city:'San Antonio'   },
  { lat:'32.7767',  lon:'-96.7970',  city:'Dallas'        },
  { lat:'30.2672',  lon:'-97.7431',  city:'Austin'        },
  { lat:'37.7749',  lon:'-122.4194', city:'San Francisco' },
  { lat:'47.6062',  lon:'-122.3321', city:'Seattle'       },
  { lat:'25.7617',  lon:'-80.1918',  city:'Miami'         },
  { lat:'36.1699',  lon:'-115.1398', city:'Las Vegas'     },
  { lat:'33.7490',  lon:'-84.3880',  city:'Atlanta'       },
  { lat:'42.3601',  lon:'-71.0589',  city:'Boston'        },
  { lat:'45.5152',  lon:'-122.6784', city:'Portland'      },
  { lat:'39.9526',  lon:'-75.1652',  city:'Philadelphia'  },
  { lat:'36.1627',  lon:'-86.7816',  city:'Nashville'     },
  { lat:'44.9778',  lon:'-93.2650',  city:'Minneapolis'   },
  { lat:'39.7392',  lon:'-104.9903', city:'Denver'        },
  { lat:'32.2226',  lon:'-110.9747', city:'Tucson'        },
];

// ── FILTRES OPTIMISÉS INSTAGRAM ───────────────────────────────
// Tous les paramètres sont des bases — randomizeFilter() les varie
// à chaque variante pour produire des millions de combinaisons uniques
const TEMPLATES = [
  // 🟢 SAFE — imperceptibles, hash différent garanti
  { name:'clean',      filter:'' },
  { name:'sharpen_xs', filter:'unsharp=3:3:0.3:3:3:0.0' },
  { name:'sharpen_s',  filter:'unsharp=5:5:0.6:5:5:0.0' },
  { name:'zoom1',      filter:'scale=iw*1.01:ih*1.01,crop=iw/1.01:ih/1.01' },
  { name:'zoom2',      filter:'scale=iw*1.02:ih*1.02,crop=iw/1.02:ih/1.02' },
  { name:'zoom3',      filter:'scale=iw*1.03:ih*1.03,crop=iw/1.03:ih/1.03' },
  { name:'grain1',     filter:'noise=alls=1:allf=t' },
  { name:'grain2',     filter:'noise=alls=2:allf=t' },
  { name:'vign_xs',    filter:'vignette=0.1' },
  { name:'eq_b05',     filter:'eq=brightness=0.05' },
  { name:'eq_s05',     filter:'eq=saturation=1.05' },
  { name:'eq_c05',     filter:'eq=contrast=1.05' },

  // 🟡 SUBTILS — légère amélioration visuelle
  { name:'sharpen_m',  filter:'unsharp=5:5:0.8:5:5:0.0' },
  { name:'pop',        filter:'eq=contrast=1.05:saturation=1.08:brightness=0.01' },
  { name:'warm_xs',    filter:'colorbalance=rs=0.03:gs=-0.01:bs=-0.02:rm=0.02:gm=-0.01:bm=-0.01' },
  { name:'clarity',    filter:'eq=contrast=1.04:brightness=0.01,unsharp=5:5:0.5:5:5:0.0' },
  { name:'cine',       filter:'eq=saturation=0.90:contrast=1.04' },
];

// ── UTILS ─────────────────────────────────────────────────────
function rnd(min, max){ return +(Math.random()*(max-min)+min).toFixed(4); }
function randInt(a,b){ return Math.floor(Math.random()*(b-a)+a); }
function pick(arr){ return arr[randInt(0, arr.length)]; }

function randomDate(){
  const d = new Date(Date.now() - randInt(1,30)*86400000);
  const h=randInt(9,22), m=randInt(0,59), s=randInt(0,59);
  return `${d.getFullYear()}:${String(d.getMonth()+1).padStart(2,'0')}:${String(d.getDate()).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function checkFFmpeg(){
  try { execSync('ffmpeg -version', {stdio:'pipe'}); return true; }
  catch(e){ return false; }
}

// ── RANDOMISATION DES FILTRES ─────────────────────────────────
// Varie chaque paramètre dans sa plage safe à chaque variante
// → des millions de combinaisons uniques même avec le même filtre de base
function randomizeFilter(filter){
  if(!filter) return filter;

  // eq= : contrast 0.5→5%, brightness ±0.005→0.02, saturation ±1→12%
  filter = filter.replace(/eq=([^,'"]+)/g, (match, params) => {
    const parts = params.split(':').map(p => {
      if(p.startsWith('contrast=')) return 'contrast=' + rnd(1.005, 1.05);
      if(p.startsWith('brightness=')){
        const cur = parseFloat(p.split('=')[1]);
        return cur >= 0 ? 'brightness='+rnd(0.01, 0.05) : 'brightness='+rnd(-0.02,-0.005);
      }
      if(p.startsWith('saturation=')){
        const cur = parseFloat(p.split('=')[1]);
        return cur >= 1 ? 'saturation='+rnd(1.01, 1.05) : 'saturation='+rnd(0.95, 0.99);
      }
      return p;
    });
    return 'eq='+parts.join(':');
  });

  // unsharp : luma_amount entre 0.2 et 0.9
  if(filter.includes('unsharp=')){
    filter = filter.replace(/unsharp=\d+:\d+:[\d.]+:\d+:\d+:[\d.]+/, m => {
      const parts = m.replace('unsharp=','').split(':');
      return 'unsharp='+parts[0]+':'+parts[1]+':'+rnd(0.2,0.9)+':'+parts[3]+':'+parts[4]+':0.0';
    });
  }

  // noise : alls entre 0.5 et 4
  filter = filter.replace(/noise=alls=[\d.]+/, () => 'noise=alls='+rnd(0.5,4));

  // vignette : angle entre 0.05 et 0.3
  filter = filter.replace(/vignette=[\d.]+/, () => 'vignette='+rnd(0.05,0.3));

  // zoom : facteur entre 1.005 et 1.035
  if(filter.includes('scale=iw*') && filter.includes('crop=iw/')){
    const z = rnd(1.005, 1.035);
    filter = filter.replace(/scale=iw\*[\d.]+:ih\*[\d.]+,crop=iw\/[\d.]+:ih\/[\d.]+/,
      'scale=iw*'+z+':ih*'+z+',crop=iw/'+z+':ih/'+z);
  }

  // colorbalance : ±0.01 par canal
  filter = filter.replace(/colorbalance=([^,'"]+)/g, (match, params) => {
    const parts = params.split(':').map(p => {
      const [k,v] = p.split('=');
      return k+'='+(+(parseFloat(v)+rnd(-0.01,0.01))).toFixed(4);
    });
    return 'colorbalance='+parts.join(':');
  });

  // hue : ±2°
  filter = filter.replace(/hue=h=(-?[\d.]+)/g, (m,h) =>
    'hue=h='+(+(parseFloat(h)+rnd(-2,2))).toFixed(1));

  return filter;
}

// ── GÉNÉRATION D'UNE VARIANTE ─────────────────────────────────
function generateVariant(inputFile, outputFile, template){
  const device   = pick(DEVICES);
  const location = pick(LOCATIONS);
  const date     = randomDate();

  // Instagram optimal encoding
  // CRF 18 fixe = qualité max, maxrate 6M = sweet spot Insta
  // profile high + level 4.0, 30fps, 48kHz AAC
  const filter = randomizeFilter(template.filter);
  const vfStr  = [filter, 'format=yuv420p'].filter(Boolean).join(',');

  const args = [
    'ffmpeg', '-y', '-i', `"${inputFile}"`,
    '-vf', `"${vfStr}"`,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.0',
    '-crf', '18',
    '-preset', 'slow',
    '-maxrate', '6M',
    '-bufsize', '12M',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-movflags', '+faststart',
    '-map_metadata', '-1',
    `-metadata make="${device.make}"`,
    `-metadata model="${device.model}"`,
    `-metadata software="${device.software}"`,
    `-metadata location="${location.lat}+${location.lon}/"`,
    `-metadata location-eng="${location.city}"`,
    `-metadata date="${date.split(' ')[0].replace(/:/g,'-')}"`,
    `-metadata comment=""`,
    `-metadata title=""`,
    `"${outputFile}"`,
  ].join(' ');

  try {
    execSync(args, {stdio:'pipe'});
    return true;
  } catch(e){
    console.error(`  ❌ Erreur: ${e.message.substring(0,200)}`);
    return false;
  }
}

// ── MAIN ──────────────────────────────────────────────────────
async function main(){
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║     Norys Reels — CLI Duplicator      ║');
  console.log('╚═══════════════════════════════════════╝\n');

  if(!checkFFmpeg()){
    console.error('❌ FFmpeg non trouvé!\n');
    console.error('  Windows : https://ffmpeg.org/download.html → ajouter au PATH');
    console.error('  Mac     : brew install ffmpeg');
    console.error('  Linux   : sudo apt install ffmpeg\n');
    process.exit(1);
  }
  console.log('✅ FFmpeg détecté\n');

  if(!fs.existsSync(INPUT_DIR)){
    fs.mkdirSync(INPUT_DIR, {recursive:true});
    console.log(`📁 Dossier créé : ${INPUT_DIR}`);
    console.log('   → Mets tes vidéos MP4/MOV dans ce dossier puis relance\n');
    return;
  }
  fs.mkdirSync(OUTPUT_DIR, {recursive:true});

  const videos = fs.readdirSync(INPUT_DIR)
    .filter(f => /\.(mp4|mov|avi|mkv|webm)$/i.test(f));

  if(!videos.length){
    console.log(`❌ Aucune vidéo trouvée dans ./${INPUT_DIR}`);
    console.log('   → Ajoute des fichiers .mp4 ou .mov et relance\n');
    return;
  }

  console.log(`🎬 ${videos.length} vidéo(s) trouvée(s)`);
  console.log(`🔄 Génération de ${NUM_VARIANTS} variante(s) par vidéo`);
  console.log(`   (filtres randomisés → millions de combinaisons uniques)\n`);

  let totalSuccess = 0, totalFail = 0;

  for(const videoFile of videos){
    const inputPath = path.join(INPUT_DIR, videoFile);
    const baseName  = path.basename(videoFile, path.extname(videoFile));

    console.log(`\n📹 Traitement : ${videoFile}`);
    console.log('─'.repeat(50));

    // Sélectionner et mélanger les templates
    const selected = [];
    for(let i=0; i<NUM_VARIANTS; i++){
      selected.push({...TEMPLATES[i % TEMPLATES.length]});
    }
    selected.sort(() => Math.random()-0.5);

    for(let i=0; i<selected.length; i++){
      const tpl      = selected[i];
      const outName  = `${baseName}_v${String(i+1).padStart(3,'0')}_${tpl.name}.mp4`;
      const outPath  = path.join(OUTPUT_DIR, outName);

      process.stdout.write(`  [${i+1}/${selected.length}] ${tpl.name.padEnd(14)}... `);

      const ok = generateVariant(inputPath, outPath, tpl);
      if(ok){
        const size = (fs.statSync(outPath).size/1024/1024).toFixed(1);
        console.log(`✅ (${size}MB)`);
        totalSuccess++;
      } else {
        console.log('❌');
        totalFail++;
      }
    }
  }

  console.log('\n'+'═'.repeat(50));
  console.log(`✅ ${totalSuccess} variante(s) générée(s)`);
  if(totalFail > 0) console.log(`❌ ${totalFail} échec(s)`);
  console.log(`📂 Résultat dans : ./${OUTPUT_DIR}/`);
  console.log('═'.repeat(50)+'\n');
}

main().catch(console.error);
