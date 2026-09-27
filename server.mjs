import http from 'node:http';
import {readFileSync, mkdirSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes, randomUUID, createHash, timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createDustClient, latestMessages, DustError, dustDiagnostic} from './dust.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a,b) => timingSafeEqual(Buffer.from(hash(String(a))), Buffer.from(hash(String(b))));
const random = () => randomBytes(32).toString('base64url');
const now = () => Date.now();
const DAY = 86_400_000;
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const emailOf = value => {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) fail(400, 'Adresse e-mail invalide.');
  return value.trim().toLowerCase();
};
function numberSetting(value, fallback, max) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Quota invalide.');
  return n;
}

export function readConfig(env = process.env) {
  const local = env.LOCAL_DEVELOPMENT === 'true';
  if (local && env.RENDER) throw new Error('LOCAL_DEVELOPMENT est interdit sur Render.');
  const origin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || (local ? 'http://localhost:3000' : '');
  if (!origin) throw new Error('PUBLIC_ORIGIN doit contenir l’adresse HTTPS du site.');
  const url = new URL(origin);
  if (url.origin !== origin || (!local && url.protocol !== 'https:') || url.username || url.password) throw new Error('PUBLIC_ORIGIN invalide : origine HTTPS sans chemin.');
  if (local && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Mode local limité à localhost.');
  if (!env.ADMIN_SECRET || env.ADMIN_SECRET.length < 32) throw new Error('ADMIN_SECRET doit contenir au moins 32 caractères aléatoires.');
  const dataDir = resolve(env.DATA_DIR || (local ? './local-data' : '/var/data'));
  if (!local) {
    if (!existsSync('/var/data') || dataDir !== '/var/data') throw new Error('Monter un disque persistant Render dans /var/data.');
    const mounts = readFileSync('/proc/mounts', 'utf8');
    if (!mounts.split('\n').some(line => line.split(' ')[1] === '/var/data')) throw new Error('Aucun disque monté sur /var/data : démarrage refusé.');
  }
  const dustOrigin = (env.DUST_ORIGIN || 'https://dust.tt').trim().replace(/\/$/, '');
  const apiKey = (env.DUST_API_KEY || '').trim();
  const workspaceId = (env.DUST_WORKSPACE_ID || '').trim();
  const agentId = (env.DUST_AGENT_ID || '').trim();
  if (!['https://dust.tt','https://eu.dust.tt'].includes(dustOrigin)) throw new Error('DUST_ORIGIN doit être https://dust.tt ou https://eu.dust.tt.');
  for (const [key, value] of [['DUST_WORKSPACE_ID',workspaceId],['DUST_AGENT_ID',agentId]]) {
    if (value && !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error(`${key} invalide : copie l’identifiant seul, pas une URL ni un nom.`);
  }
  return {
    local, origin, adminSecret: env.ADMIN_SECRET, dataDir, dustOrigin,
    apiKey, workspaceId, agentId,
    defaultDailyLimit: numberSetting(env.DAILY_LIMIT, 20, 200),
    globalDailyLimit: numberSetting(env.GLOBAL_DAILY_LIMIT, 200, 5000),
    maxAnswerChars: numberSetting(env.MAX_ANSWER_CHARS, 6000, 20000),
    pollMs: 1800, jobTimeoutMs: 240000,
    ready: Boolean(apiKey && workspaceId && agentId)
  };
}

export function createApplication(config, dustOverride) {
  mkdirSync(config.dataDir, {recursive:true, mode:0o700});
  const db = new DatabaseSync(resolve(config.dataDir, 'access.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS testers (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, code_hash TEXT NOT NULL,
      expires INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      daily_limit INTEGER NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, user_id TEXT,
      credential_hash TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, dust_id TEXT, turns INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, thread_id TEXT NOT NULL,
      state TEXT NOT NULL, answer TEXT, error_code TEXT, created INTEGER NOT NULL,
      feedback INTEGER, response_chars INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS jobs_user_date ON jobs(user_id, created);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, used INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, user_id TEXT, event TEXT NOT NULL, created INTEGER NOT NULL,
      job_id TEXT, code TEXT);
  `);
  // A restart must not automatically repeat an upstream request (billing / duplication).
  db.prepare("UPDATE jobs SET state='error', error_code='restart' WHERE state='pending'").run();
  const dust = dustOverride || createDustClient(config);
  const running = new Map();
  let stopping = false;
  const cookieName = config.local ? 'polytechnique_session' : '__Host-polytechnique_session';
  const assets = new Map([
    ['/', ['index.html','text/html; charset=utf-8']],
    ['/admin', ['admin.html','text/html; charset=utf-8']],
    ['/style.css', ['style.css','text/css; charset=utf-8']],
    ['/app.js', ['app.js','text/javascript; charset=utf-8']],
    ['/markdown.js', ['markdown.js','text/javascript; charset=utf-8']],
    ['/vendor/markdown-it-15.0.2.mjs', ['vendor/markdown-it-15.0.2.mjs','text/javascript; charset=utf-8']],
    ['/admin.js', ['admin.js','text/javascript; charset=utf-8']],
    ['/alumnix.css', ['alumnix.css','text/css; charset=utf-8']],
    ['/experience.js', ['experience.js','text/javascript; charset=utf-8']],
    ['/assets/polytechnique-x.svg', ['assets/polytechnique-x.svg','image/svg+xml']],
    ['/assets/portrait-mask.svg', ['assets/portrait-mask.svg','image/svg+xml']],
    ['/assets/generations.webp', ['assets/generations.webp','image/webp']],
    ['/assets/bodoni-400.ttf', ['assets/bodoni-400.ttf','font/ttf']],
    ['/assets/hanken-400.ttf', ['assets/hanken-400.ttf','font/ttf']],
    ['/assets/hanken-500.ttf', ['assets/hanken-500.ttf','font/ttf']],
    ['/assets/hanken-600.ttf', ['assets/hanken-600.ttf','font/ttf']],
  ].map(([route,[file,type]]) => [route,{content:readFileSync(resolve(root,'public',file)),type}]));

  const audit = (userId,event,jobId=null,code=null) => db.prepare('INSERT INTO audit(user_id,event,created,job_id,code) VALUES(?,?,?,?,?)').run(userId,event,now(),jobId,code);
  const dayStart = () => Math.floor(now()/DAY)*DAY; // UTC: documented to users.
  const usedToday = userId => db.prepare('SELECT count(*) AS n FROM jobs WHERE user_id=? AND created>=?').get(userId,dayStart()).n;
  const tester = id => db.prepare('SELECT * FROM testers WHERE id=? AND enabled=1 AND expires>?').get(id,now());
  const getSession = req => {
    const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if (!raw || !/^[\w-]{43}$/.test(raw)) return null;
    const row = db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(hash(raw),now());
    if (!row) return null;
    if (row.role === 'admin') return same(row.credential_hash,hash(config.adminSecret)) ? row : null;
    const user = tester(row.user_id);
    return user && same(row.credential_hash,user.code_hash) ? {...row,user} : null;
  };
  const requireSession = (req,role) => {
    const session = getSession(req);
    if (!session) fail(401,'Ta session a expiré. Connecte-toi à nouveau.');
    if (session.role !== role) fail(403,'Accès non autorisé.');
    return session;
  };
  function rate(key,limit,interval) {
    const current = db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);
    if (!current || current.expires <= now()) {
      db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET used=1,expires=excluded.expires').run(key,now()+interval);
    } else {
      if (current.used >= limit) fail(429,'Trop de tentatives. Réessaie plus tard.');
      db.prepare('UPDATE rate_limits SET used=used+1 WHERE key=?').run(key);
    }
  }
  function issueSession(res,role,user=null) {
    const token = random();
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(hash(token),role,user?.id || null,user?.code_hash || hash(config.adminSecret),now()+12*3600000);
    res.setHeader('Set-Cookie',`${cookieName}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=43200${config.local?'':'; Secure'}`);
  }
  function securityHeaders(res) {
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    if (!config.local) res.setHeader('Strict-Transport-Security','max-age=31536000');
  }
  function json(res,status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); }
  async function body(req) {
    if (req.headers.origin !== config.origin) fail(403,'Origine de la requête refusée.');
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail(415,'Format de requête invalide.');
    if (Number(req.headers['content-length'] || 0)>8192) fail(413,'Requête trop longue.');
    let size=0; const chunks=[];
    for await (const chunk of req) { size+=chunk.length; if(size>8192) fail(413,'Requête trop longue.'); chunks.push(chunk); }
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!parsed || Array.isArray(parsed) || typeof parsed!=='object') fail(400,'Requête invalide.');
      return parsed;
    } catch { fail(400,'Requête invalide.'); }
  }
  function only(data, keys) { if(Object.keys(data).some(k=>!keys.includes(k))) fail(400,'Paramètre non autorisé.'); }
  const jobError = code => /agent_inaccessible$/.test(code)
    ? 'L’agent est désactivé ou inaccessible dans Dust. L’organisateur doit rétablir son accès avant de réessayer.'
    : ({
    revoked:'Cet accès a expiré ou a été retiré.',
    timeout:'La recherche a pris trop de temps. Réessaie avec une question plus précise.',
    restart:'Le service a redémarré pendant la recherche. Cette demande n’a pas été relancée.',
    too_long:'La réponse dépasse la taille autorisée. Demande une information plus précise.',
    dust_action_required:'L’agent demande une action ou une autorisation non prise en charge sur cette page.',
    dust_http_401:'La connexion à l’assistant doit être corrigée par l’organisateur.',
    dust_http_403:'L’assistant n’a pas les droits nécessaires pour cette recherche.',
    dust_http_429:'Le service a atteint sa limite d’utilisation. Réessaie plus tard.'
  }[code] || 'La recherche est indisponible. Signale ce problème à l’organisateur.');

  async function runJob(jobId,userId,threadId,content) {
    let conversationId = null; let pendingIds=[];
    const task = {cancel:false}; running.set(jobId,task);
    try {
      if (!tester(userId) || task.cancel || stopping) throw new DustError('revoked');
      const thread = db.prepare('SELECT * FROM threads WHERE id=?').get(threadId);
      conversationId = thread.dust_id;
      let previous = new Set();
      let current;
      if (conversationId) {
        const before = await dust.get(conversationId);
        previous = new Set(latestMessages(before).map(m=>m.sId));
        if (!tester(userId) || task.cancel || stopping) throw new DustError('revoked');
        await dust.post(conversationId,content);
      } else {
        current = await dust.create(content);
        conversationId = current.sId;
        db.prepare('UPDATE threads SET dust_id=? WHERE id=?').run(conversationId,threadId);
      }
      const deadline = now()+config.jobTimeoutMs;
      while (true) {
        current = current || await dust.get(conversationId);
        const agents = latestMessages(current).filter(m=>m.type==='agent' && !previous.has(m.sId));
        pendingIds = agents.filter(m=>!['succeeded','completed','failed','cancelled'].includes(m.status)).map(m=>m.sId).filter(Boolean);
        if (!tester(userId) || task.cancel || stopping) throw new DustError('revoked');
        const answer = agents.find(m=>m.configuration?.sId===config.agentId && m.visibility!=='deleted');
        if (answer?.status==='succeeded' || answer?.status==='completed') {
          if (typeof answer.content!=='string' || !answer.content.trim()) throw new DustError('dust_format');
          if (answer.content.length > config.maxAnswerChars) throw new DustError('too_long');
          // No chainOfThought, actions, config, download URLs or raw source documents.
          db.prepare("UPDATE jobs SET state='done',answer=?,response_chars=? WHERE id=?").run(answer.content,answer.content.length,jobId);
          audit(userId,'answer',jobId); return;
        }
        if (answer && ['failed','cancelled'].includes(answer.status)) throw new DustError('dust_failed');
        if (answer && ['blocked','paused','waiting_for_validation','waiting_for_user','action_required'].includes(answer.status)) throw new DustError('dust_action_required');
        if (now()>deadline) throw new DustError('timeout');
        current = null;
        await new Promise(r=>setTimeout(r,config.pollMs));
      }
    } catch (error) {
      // Cancellation is best effort. A timeout never automatically resubmits a request.
      if(conversationId && pendingIds.length) { try { await dust.cancel(conversationId,pendingIds); } catch {} }
      const code = error instanceof DustError ? error.code : 'internal';
      db.prepare("UPDATE jobs SET state='error',error_code=? WHERE id=?").run(code,jobId);
      // Avoid continuing a conversation whose previous turn may still be running.
      db.prepare('UPDATE threads SET turns=12 WHERE id=?').run(threadId);
      audit(userId,'error',jobId,code);
    } finally { running.delete(jobId); }
  }

  const server = http.createServer(async (req,res)=>{
    securityHeaders(res);
    try {
      if (stopping) fail(503,'Le service redémarre.');
      const path = new URL(req.url,config.origin).pathname;
      if (req.method==='GET' && path==='/healthz') { json(res,200,{ok:true}); return; }
      if (req.method==='GET' && assets.has(path)) {
        const a=assets.get(path); res.writeHead(200,{'Content-Type':a.type}); res.end(a.content); return;
      }
      if (req.method==='GET' && path==='/robots.txt') {res.writeHead(200,{'Content-Type':'text/plain'});res.end('User-agent: *\nDisallow: /\n');return;}
      if (req.method==='POST' && path==='/api/login') {
        const data=await body(req); only(data,['email','code']);
        const email=emailOf(data.email);
        rate('login:global',200,15*60000); rate('login:'+hash(email),8,15*60000);
        const user=db.prepare('SELECT * FROM testers WHERE email=? AND enabled=1 AND expires>?').get(email,now());
        const candidate=typeof data.code==='string'?data.code.trim():'';
        const valid=same(hash(candidate),user?.code_hash || hash('invalid'));
        if(!user || !valid || candidate.length>100) fail(401,'Adresse ou code incorrect, expiré ou révoqué.');
        db.prepare('DELETE FROM rate_limits WHERE key=?').run('login:'+hash(email));
        issueSession(res,'tester',user); audit(user.id,'login'); json(res,200,{ok:true}); return;
      }
      if (req.method==='POST' && path==='/api/admin/login') {
        const data=await body(req); only(data,['secret']); rate('admin:login',8,15*60000);
        if(typeof data.secret!=='string' || !same(data.secret,config.adminSecret)) fail(401,'Code administrateur incorrect.');
        db.prepare("DELETE FROM rate_limits WHERE key='admin:login'").run();
        issueSession(res,'admin'); audit(null,'admin_login'); json(res,200,{ok:true}); return;
      }
      if (req.method==='POST' && path==='/api/logout') {
        await body(req); const session=getSession(req);
        if(session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);
        res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${config.local?'':'; Secure'}`);
        json(res,200,{ok:true}); return;
      }
      if (req.method==='GET' && path==='/api/me') {
        const s=requireSession(req,'tester'); json(res,200,{email:s.user.email,used:usedToday(s.user.id),limit:s.user.daily_limit,ready:config.ready}); return;
      }
      if (req.method==='POST' && path==='/api/chat') {
        const s=requireSession(req,'tester'); const data=await body(req); only(data,['message','threadId']);
        if(!config.ready) fail(503,'L’organisateur doit encore connecter l’assistant.');
        if(typeof data.message!=='string' || !data.message.trim() || data.message.length>2000) fail(400,'Écris une question de 1 à 2 000 caractères.');
        if(db.prepare("SELECT id FROM jobs WHERE user_id=? AND state='pending'").get(s.user.id)) fail(409,'Une recherche est déjà en cours.');
        rate('chat:'+s.user.id,6,60000);
        if(usedToday(s.user.id)>=s.user.daily_limit) fail(429,'Ton quota du jour est atteint. Il se renouvelle à 00:00 UTC.');
        if(db.prepare('SELECT count(*) AS n FROM jobs WHERE created>=?').get(dayStart()).n>=config.globalDailyLimit) fail(429,'Le quota de la session de test est atteint pour aujourd’hui.');
        let thread;
        if(data.threadId!==null && data.threadId!==undefined) {
          if(typeof data.threadId!=='string') fail(400,'Conversation invalide.');
          thread=db.prepare('SELECT * FROM threads WHERE id=? AND user_id=?').get(data.threadId,s.user.id);
          if(!thread) fail(404,'Conversation introuvable.');
          if(thread.turns>=12) fail(409,'Ouvre une nouvelle conversation pour continuer.');
        } else {
          thread={id:randomUUID()}; db.prepare('INSERT INTO threads(id,user_id,created) VALUES(?,?,?)').run(thread.id,s.user.id,now());
        }
        const jobId=randomUUID();
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('INSERT INTO jobs(id,user_id,thread_id,state,created) VALUES(?,?,?,?,?)').run(jobId,s.user.id,thread.id,'pending',now());
          db.prepare('UPDATE threads SET turns=turns+1 WHERE id=?').run(thread.id);
          db.exec('COMMIT');
        } catch(error) {db.exec('ROLLBACK');throw error;}
        audit(s.user.id,'question',jobId);
        json(res,202,{jobId,threadId:thread.id,used:usedToday(s.user.id),limit:s.user.daily_limit});
        void runJob(jobId,s.user.id,thread.id,data.message.trim()); return;
      }
      const jobMatch=path.match(/^\/api\/jobs\/([a-f0-9-]{36})$/);
      if(req.method==='GET' && jobMatch) {
        const s=requireSession(req,'tester'); rate('poll:'+s.user.id,90,60000);
        const row=db.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').get(jobMatch[1],s.user.id);
        if(!row) fail(404,'Demande introuvable.');
        if(row.state==='done' && row.answer===null) fail(410,'Cette réponse a expiré sur cette page.');
        json(res,200,{state:row.state,...(row.state==='done'?{answer:row.answer}:{}),...(row.state==='error'?{error:jobError(row.error_code)}:{})}); return;
      }
      if(req.method==='POST' && path==='/api/feedback') {
        const s=requireSession(req,'tester'); const data=await body(req); only(data,['jobId','rating']);
        if(typeof data.jobId!=='string' || ![1,-1].includes(data.rating)) fail(400,'Avis invalide.');
        const result=db.prepare("UPDATE jobs SET feedback=? WHERE id=? AND user_id=? AND state='done'").run(data.rating,data.jobId,s.user.id);
        if(!result.changes) fail(404,'Réponse introuvable.'); json(res,200,{ok:true}); return;
      }
      if(path.startsWith('/api/admin/')) {
        requireSession(req,'admin');
        if(req.method==='GET' && path==='/api/admin/state') {
          const users=db.prepare('SELECT id,email,expires,enabled,daily_limit FROM testers ORDER BY created DESC').all().map(u=>({...u,used:usedToday(u.id)}));
          const stats=db.prepare("SELECT count(*) AS questions,sum(state='done') AS completed,sum(feedback=1) AS positive,sum(feedback=-1) AS negative FROM jobs WHERE created>=?").get(dayStart());
          const events=db.prepare('SELECT a.created,a.event,a.code,t.email FROM audit a LEFT JOIN testers t ON t.id=a.user_id ORDER BY a.id DESC LIMIT 100').all()
            .map(e=>({...e,...(e.code?.endsWith('agent_inaccessible')?{detail:dustDiagnostic(e.code).message}:{})}));
          json(res,200,{users,stats,events,ready:config.ready,defaultDailyLimit:config.defaultDailyLimit,globalDailyLimit:config.globalDailyLimit}); return;
        }
        if(req.method==='POST' && path==='/api/admin/dust/check') {
          const data=await body(req); only(data,[]);
          rate('admin:dust:check',6,60000);
          try {
            if(!config.ready) throw new DustError('dust_not_configured');
            const agent=await dust.checkAgent();
            json(res,200,{ok:true,message:agent.status==='draft'
              ? 'L’agent est accessible, mais encore en brouillon.'
              : 'L’agent est actif et sa configuration est accessible avec cette clé.',
              steps:['Cette vérification ne lance aucune génération. Teste maintenant une question pour vérifier aussi le modèle, les outils et les crédits.']});
          } catch(error) {
            const code=error instanceof DustError?error.code:'internal';
            json(res,200,{ok:false,code,...dustDiagnostic(code)});
          }
          return;
        }
        if(req.method==='POST' && path==='/api/admin/invite') {
          const data=await body(req); only(data,['email','days','dailyLimit']); const email=emailOf(data.email);
          const days=Number(data.days); const limit=Number(data.dailyLimit);
          if(!Number.isInteger(days)||days<1||days>30||!Number.isInteger(limit)||limit<1||limit>200) fail(400,'Durée ou quota invalide.');
          const code=random(); const previous=db.prepare('SELECT id FROM testers WHERE email=?').get(email);
          const id=previous?.id || randomUUID(); const expires=now()+days*DAY;
          db.prepare(`INSERT INTO testers VALUES(?,?,?,?,1,?,?) ON CONFLICT(email) DO UPDATE SET
            code_hash=excluded.code_hash,expires=excluded.expires,enabled=1,daily_limit=excluded.daily_limit`).run(id,email,hash(code),expires,limit,now());
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
          audit(id,'access_created'); json(res,200,{email,code,expires,url:config.origin}); return;
        }
        if(req.method==='POST' && path==='/api/admin/revoke') {
          const data=await body(req); only(data,['id']); if(typeof data.id!=='string') fail(400,'Accès invalide.');
          db.prepare('UPDATE testers SET enabled=0 WHERE id=?').run(data.id);
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(data.id);
          audit(data.id,'access_revoked'); json(res,200,{ok:true}); return;
        }
      }
      fail(404,'Page introuvable.');
    } catch(error) {
      if(!res.headersSent) json(res,error.status || 500,{error:error.status?error.message:'Une erreur interne est survenue.'});
      else res.end();
      // No raw errors: upstream payloads, questions, emails and credentials stay out of stdout.
      if(!error.status) console.error('request_failed');
    }
  });
  server.requestTimeout=15000; server.headersTimeout=10000; server.keepAliveTimeout=5000;
  const cleanup=setInterval(()=>{
    db.prepare('DELETE FROM sessions WHERE expires<?').run(now());
    db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now());
    db.prepare('UPDATE jobs SET answer=NULL WHERE created<?').run(now()-3600000);
    db.prepare('DELETE FROM audit WHERE created<?').run(now()-30*DAY);
    db.prepare('DELETE FROM jobs WHERE created<?').run(now()-30*DAY);
    db.prepare('DELETE FROM threads WHERE created<?').run(now()-30*DAY);
    db.prepare('DELETE FROM testers WHERE expires<?').run(now()-30*DAY);
  },60000); cleanup.unref();
  return {server,db,async close(){stopping=true;clearInterval(cleanup);for(const t of running.values())t.cancel=true;await new Promise(r=>server.close(r));while(running.size)await new Promise(r=>setTimeout(r,20));db.close();}};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const config=readConfig(); const app=createApplication(config);
    app.server.listen(Number(process.env.PORT || 3000),config.local?'127.0.0.1':'0.0.0.0',()=>console.log('Application démarrée.'));
    const stop=()=>{void app.close().then(()=>process.exit(0));};
    process.on('SIGTERM',stop); process.on('SIGINT',stop);
  } catch(error) {console.error(error.message);process.exit(1);}
}
