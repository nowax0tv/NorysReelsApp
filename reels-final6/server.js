// ============================================================
//  Norys Reels — Serveur local
//  node server.js → http://localhost:3333
// ============================================================

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { execSync } = require('child_process');

const PORT = 3333;

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

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(a,b){ return Math.floor(Math.random()*(b-a)+a); }
function rand(a,b){ return Math.random()*(b-a)+a; }

function randomDate(){
  const d = new Date(Date.now() - randInt(1,30)*86400000);
  const h=randInt(9,22), m=randInt(0,59), s=randInt(0,59);
  return `${d.getFullYear()}:${String(d.getMonth()+1).padStart(2,'0')}:${String(d.getDate()).padStart(2,'0')} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function generateVariant(inputFile, outputFile, filter, special=''){
  const dev = pick(DEVICES);
  const loc = pick(LOCATIONS);
  const date = randomDate();
  const crf = randInt(22,27);
  const preset = pick(['medium','slow','fast']);
  const abr = pick(['128k','160k','192k']);

  const vfArgs = filter ? ['-vf', filter] : [];

  const args = [
    '-y', '-i', inputFile,
    ...vfArgs,
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-preset', preset,
    '-c:a', 'aac',
    '-b:a', abr,
    '-movflags', '+faststart',
    '-map_metadata', '-1',
    '-metadata', `make=${dev.make}`,
    '-metadata', `model=${dev.model}`,
    '-metadata', `software=${dev.software}`,
    '-metadata', `location=${loc.lat}+${loc.lon}/`,
    '-metadata', `location-eng=${loc.city}`,
    '-metadata', `date=${date.split(' ')[0].replace(/:/g,'-')}`,
    '-metadata', 'comment=',
    '-metadata', 'title=',
    outputFile,
  ];

  try {
    // Construire la commande en échappant correctement
    const cmd = 'ffmpeg ' + args.map(a => {
      // Échapper les guillemets et espaces
      if(a.includes(' ') || a.includes('=')) return `"${a.replace(/"/g,'\\"')}"`;
      return a;
    }).join(' ');
    execSync(cmd, { stdio:'pipe', timeout: 120000 });
    return true;
  } catch(e){
    console.error('FFmpeg error:', e.message.substring(0,200));
    return false;
  }
}

// Parse multipart robuste
function parseMultipart(body, boundary){
  const parts = [];
  const sep = Buffer.from('\r\n--' + boundary);
  const start = Buffer.from('--' + boundary + '\r\n');

  let pos = body.indexOf(start);
  if(pos === -1) return parts;
  pos += start.length;

  while(true){
    const nextSep = body.indexOf(sep, pos);
    if(nextSep === -1) break;

    const part = body.slice(pos, nextSep);
    const headEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if(headEnd === -1){ pos = nextSep + sep.length + 2; continue; }

    const headers = part.slice(0, headEnd).toString('utf8');
    const content = part.slice(headEnd + 4);

    const nameMatch    = headers.match(/name="([^"]+)"/);
    const fileMatch    = headers.match(/filename="([^"]+)"/);

    if(nameMatch){
      parts.push({
        name:     nameMatch[1],
        filename: fileMatch ? fileMatch[1] : null,
        data:     content,
      });
    }

    pos = nextSep + sep.length + 2;
  }
  return parts;
}

// ── SERVER ────────────────────────────────────────────────────
const server = http.createServer((req, res) => {

  // Serve index.html
  if(req.url === '/' || req.url === '/index.html'){
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    return;
  }

  // Check FFmpeg
  if(req.url === '/check-ffmpeg'){
    try {
      const out = execSync('ffmpeg -version', {stdio:'pipe'}).toString();
      const v = (out.match(/ffmpeg version ([^\s]+)/) || [])[1] || '?';
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true, version:v}));
    } catch {
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:false}));
    }
    return;
  }

  // Convert MOV → MP4
  if(req.url === '/convert' && req.method === 'POST'){
    res.writeHead(200, {
      'Content-Type':'text/plain; charset=utf-8',
      'Transfer-Encoding':'chunked',
      'Cache-Control':'no-cache',
    });
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const ct = req.headers['content-type'] || '';
        const bMatch = ct.match(/boundary=([^\s;]+)/);
        if(!bMatch){ res.end(); return; }
        const parts = parseMultipart(body, bMatch[1]);
        const outDir = path.join(os.homedir(), 'Desktop', 'Norys Reels Output');
        if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive:true });

        for(const p of parts){
          if(p.name === 'video' && p.filename){
            const ext = path.extname(p.filename) || '.mov';
            const tmp = path.join(os.tmpdir(), `conv_${Date.now()}${ext}`);
            fs.writeFileSync(tmp, p.data);
            const outName = path.basename(p.filename, ext) + '_converted.mp4';
            const outPath = path.join(outDir, outName);
            send(res, { type:'start', file: outName });
            try {
              const cmd = `ffmpeg -y -i "${tmp}" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p" -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p -crf 18 -preset fast -c:a aac -ar 44100 -b:a 192k -movflags +faststart "${outPath}"`;
              execSync(cmd, { stdio:'pipe', timeout:300000 });
              const size = (fs.statSync(outPath).size/1024/1024).toFixed(1);
              send(res, { type:'done', file: outName, size, path: outPath });
            } catch(e){
              send(res, { type:'error', msg: e.message.substring(0,200) });
            }
            try { fs.unlinkSync(tmp); } catch{}
          }
        }
        res.end();
      } catch(e){ send(res, { type:'error', msg: e.message }); res.end(); }
    });
    return;
  }

  // Generate
  if(req.url === '/generate' && req.method === 'POST'){
    res.writeHead(200, {
      'Content-Type':'text/plain; charset=utf-8',
      'Transfer-Encoding':'chunked',
      'Cache-Control':'no-cache',
    });

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = Buffer.concat(chunks);
        const ct = req.headers['content-type'] || '';
        const bMatch = ct.match(/boundary=([^\s;]+)/);
        if(!bMatch){ res.end(); return; }

        const parts = parseMultipart(body, bMatch[1]);

        let numVariants = 10;
        let outputDir   = path.join(os.homedir(), 'Desktop', 'Norys Reels Output');
        let filters     = [];
        let combineMode = false;
        const tmpFiles  = [];

        for(const p of parts){
          const val = p.data.toString('utf8').trim();
          if(p.name === 'numVariants') numVariants = parseInt(val) || 10;
          else if(p.name === 'outputDir'){
            if(val !== 'desktop' && val){
              outputDir = val;
            }
          }
          else if(p.name === 'filters'){
            try { filters = JSON.parse(val); } catch{}
          }
          else if(p.name === 'combineMode'){
            combineMode = val === '1';
          }
          else if(p.name === 'videos' && p.filename){
            const ext = path.extname(p.filename) || '.mp4';
            const tmp = path.join(os.tmpdir(), `nreels_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
            fs.writeFileSync(tmp, p.data);
            tmpFiles.push({ tmp, name: p.filename });
            console.log(`Saved temp: ${tmp} (${p.data.length} bytes)`);
          }
        }

        if(!filters.length) filters = [{ id:'clean', filter:'' }];
        if(!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive:true });

        const total = tmpFiles.length * numVariants;
        send(res, { type:'start', total });
        console.log(`Generating ${total} variants into: ${outputDir}`);

        let success = 0;
        for(const vf of tmpFiles){
          const base = path.basename(vf.name, path.extname(vf.name));
          for(let i = 0; i < numVariants; i++){
            let tplId, combinedFilter, combinedSpecial;

            if(combineMode && filters.length >= 2){
              const idx1 = i % filters.length;
              const idx2 = (idx1 + 1 + Math.floor(Math.random() * (filters.length - 1))) % filters.length;
              const t1 = filters[idx1];
              const t2 = filters[idx2];
              const f1 = (t1.special === 'reverse' || !t1.filter) ? '' : t1.filter;
              const f2 = (t2.special === 'reverse' || !t2.filter) ? '' : t2.filter;
              combinedFilter = [f1, f2].filter(Boolean).join(',');
              combinedSpecial = t1.special === 'reverse' ? 'reverse' : (t2.special === 'reverse' ? 'reverse' : '');
              tplId = `${t1.id}+${t2.id}`;
            } else {
              const tpl = filters[i % filters.length];
              combinedFilter = tpl.filter;
              combinedSpecial = tpl.special || '';
              tplId = tpl.id;
            }

            const outName = `${base}_v${String(i+1).padStart(3,'0')}_${tplId}.mp4`;
            const outPath = path.join(outputDir, outName);
            console.log(`[${i+1}/${numVariants}] ${tplId} → ${outName}`);
            const ok = generateVariant(vf.tmp, outPath, combinedFilter, combinedSpecial);
            if(ok){ success++; send(res, { type:'progress', file:outName }); }
            else { send(res, { type:'error', file:outName, msg:'FFmpeg error' }); }
          }
          try { fs.unlinkSync(vf.tmp); } catch{}
        }

        send(res, { type:'done', success, total, outputDir });
        res.end();
      } catch(err){
        console.error('Server error:', err);
        send(res, { type:'error', file:'', msg: err.message });
        res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

function send(res, obj){
  try { res.write(JSON.stringify(obj) + '\n'); } catch{}
}

server.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║       Norys Reels — Démarré ✓         ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log(`\n🌐 Ouvre ton navigateur sur :`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log('Pour arrêter : Ctrl+C\n');

  try {
    const p = os.platform();
    if(p==='win32') execSync('start http://localhost:'+PORT, {stdio:'ignore'});
    else if(p==='darwin') execSync('open http://localhost:'+PORT, {stdio:'ignore'});
    else execSync('xdg-open http://localhost:'+PORT, {stdio:'ignore'});
  } catch{}
});
