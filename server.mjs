import {createAccounts} from './accounts.mjs';
import {createInbox,validateMailbox} from './inbox.mjs';
import {generateAI,validateAISettings} from './ai.mjs';
import {normalizeDesign,renderDesign} from './public/email-design.js';
import {createSettingsStore} from './settings-store.mjs';
import {createOAuth} from './oauth.mjs';
import {handleMcp} from './mcp.mjs';
import {importPlan} from './public/import-tools.js';
import {stages,lifecycles,report} from './crm.mjs';
import {normaliseSenders,normaliseLists,subscriberPayload} from './public/mailketing.js';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const env=process.env, port=Number(env.PORT||3000), root=fileURLToPath(new URL('./public/',import.meta.url));
if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32) throw Error('Set SESSION_SECRET (32+ karakter).');
const base=(env.APP_URL||`http://localhost:${port}`).replace(/\/$/,'');
if(!['http:','https:'].includes(new URL(base).protocol)||new URL(base).origin!==base)throw Error('APP_URL harus berupa origin domain tanpa path.');
mkdirSync(env.DATA_DIR||'./data',{recursive:true});
const db=new DatabaseSync(`${env.DATA_DIR||'./data'}/crm.sqlite`);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,data TEXT,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,expires INTEGER); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS suppressions(email TEXT PRIMARY KEY,reason TEXT); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,contact TEXT,campaign TEXT,owner TEXT,status TEXT,due INTEGER,payload TEXT,error TEXT DEFAULT '',message_id TEXT,created INTEGER); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,contact TEXT,job TEXT,type TEXT,data TEXT,created INTEGER); CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,due); CREATE INDEX IF NOT EXISTS events_job ON events(job,type); CREATE TABLE IF NOT EXISTS audit(id TEXT,action TEXT,created INTEGER); CREATE TABLE IF NOT EXISTS syncjobs(id TEXT PRIMARY KEY,contact TEXT,list INTEGER,status TEXT,due INTEGER,attempts INTEGER DEFAULT 0,error TEXT DEFAULT '',created INTEGER,UNIQUE(contact,list)); CREATE TABLE IF NOT EXISTS webhooks(id TEXT PRIMARY KEY,payload TEXT,contact TEXT,created INTEGER);`);
db.prepare("UPDATE syncjobs SET status='queued' WHERE status='sending'").run();
// An interrupted provider request has unknown outcome: never auto-resend it.
db.prepare("UPDATE jobs SET status='uncertain',error='Server berhenti saat pengiriman. Periksa provider sebelum kirim ulang.' WHERE status='sending'").run();
const uid=()=>randomBytes(16).toString('hex'), hash=s=>createHash('sha256').update(s).digest('hex'), sign=s=>createHmac('sha256',env.SESSION_SECRET).update(s).digest('base64url');
const safeEqual=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&timingSafeEqual(a,b);};
const all=k=>db.prepare('SELECT data FROM records WHERE kind=?').all(k).map(r=>JSON.parse(r.data));
const get=(k,id)=>{if(typeof id!=='string'||!id)return null;const r=db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(k,id);return r?JSON.parse(r.data):null;};
const put=(k,d)=>{d.id||=uid();d.created||=Date.now();d.updated=Date.now();db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?)').run(k,d.id,JSON.stringify(d));return d;};
const credentials=createSettingsStore(db,env);
const accounts=createAccounts(db,credentials.email);
const setting=k=>db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value||'';
const config=()=>({name:setting('name')||'MailK CRM',from_name:setting('from_name')||env.FROM_NAME||'',from_email:setting('from_email')||env.FROM_EMAIL||'',address:setting('address')||env.BUSINESS_ADDRESS||'',token:credentials.secret('mailketing_token'),enabled:setting('enabled')==='true',auto_sync:setting('auto_sync')==='true',default_list:Number(setting('default_list')||0)});
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validEmail=s=>typeof s==='string'&&s.length<=255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
function fail(message,status=400){throw Object.assign(Error(message),{status});}
async function checked(fn,status=400){try{return await fn();}catch(error){fail(error.message,status);}}
const audit=a=>db.prepare('INSERT INTO audit VALUES(?,?,?)').run(uid(),a,Date.now());
function suppressed(email){return !!db.prepare('SELECT email FROM suppressions WHERE email=?').get(email);}
function suppress(c,reason){db.prepare('INSERT OR REPLACE INTO suppressions VALUES(?,?)').run(c.email,reason);c.status=reason==='bounce'?'bounced':'unsubscribed';put('contacts',c);db.prepare("UPDATE jobs SET status='skipped',error=? WHERE contact=? AND status='queued'").run(reason,c.id);db.prepare("UPDATE syncjobs SET status='skipped',error=? WHERE contact=? AND status='queued'").run(reason,c.id);}
function contact(data,emit=true,verified=false,noSync=false){
 const email=String(data.email||'').trim().toLowerCase(); if(!validEmail(email))fail('Email tidak valid.');
 const byId=data.id&&get('contacts',data.id),old=byId?.email===email?byId:all('contacts').find(c=>c.email===email); if(data.id&&old&&old.id!==data.id)fail('Email sudah digunakan.');
 const c={...(old||{}),...data,id:old?.id||data.id||uid(),email};if(old){c.created=old.created;c.consent_at=old.consent_at;c.consent_evidence=verified?data.consent_evidence:old.consent_evidence;}c.lifecycle=c.lifecycle||'lead';if(!lifecycles.includes(c.lifecycle))fail('Tahap pelanggan tidak valid.');c.company=String(c.company||'').slice(0,255);c.source=String(c.source||'Manual').slice(0,255);c.owner=String(c.owner||'').slice(0,255);c.name=String(c.name||'').slice(0,255);c.phone=String(c.phone||'').slice(0,30);c.tags=Array.isArray(c.tags)?[...new Set(c.tags.map(String))]:[];c.custom=c.custom&&typeof c.custom==='object'&&!Array.isArray(c.custom)?c.custom:{};
 c.consent=c.consent===true;c.status=c.status||'active';if(!['active','unsubscribed','bounced','pending'].includes(c.status))fail('Status tidak valid.');if(!c.consent&&c.status==='active')c.status='pending';if(old&&old.status!=='active'&&c.status==='active'&&!(verified&&old.status==='pending'))c.status=old.status;const suppression=db.prepare('SELECT reason FROM suppressions WHERE email=?').get(email);if(suppression)c.status=suppression.reason==='bounce'?'bounced':'unsubscribed';if(c.consent&&!old?.consent){c.consent_at=Date.now();c.consent_source=String(data.source||'manual');}
 for(const f of all('fields')){const v=c.custom[f.key];if(f.required&&c.status==='active'&&(v===undefined||v===''))fail(`Field ${f.name} wajib diisi.`);if(v!==undefined&&v!==''&&f.type==='number'&&!Number.isFinite(Number(v)))fail(`Field ${f.name} harus angka.`);if(v&&f.type==='email'&&!validEmail(v))fail(`Field ${f.name} harus email.`);if(v&&f.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(v))fail(`Field ${f.name} harus tanggal YYYY-MM-DD.`);}
 put('contacts',c);if(!noSync)queueSync(c); if(emit){if(!old)event(c,'contact_added',{});for(const t of c.tags)if(!old?.tags.includes(t))event(c,'tag_added',{tag:t});}return c;
}
function queueSync(c){const cfg=config();if(!cfg.auto_sync||!cfg.default_list||c.status!=='active'||!c.consent||suppressed(c.email)||(c.mailketing_lists||[]).includes(String(cfg.default_list)))return;
 db.prepare("INSERT OR IGNORE INTO syncjobs(id,contact,list,status,due,created) VALUES(?,?,?,'queued',?,?)").run(uid(),c.id,cfg.default_list,Date.now(),Date.now());
}
async function tickSync(){if(!config().auto_sync)return;
 const j=db.prepare("SELECT * FROM syncjobs WHERE status='queued' AND due<=? ORDER BY due LIMIT 1").get(Date.now());if(!j)return;const c=get('contacts',j.contact);
 if(!c||c.status!=='active'||!c.consent||suppressed(c.email)||j.list!==config().default_list){db.prepare("UPDATE syncjobs SET status='skipped',error='Kontak tidak aktif atau list tujuan berubah' WHERE id=?").run(j.id);return;}
 db.prepare("UPDATE syncjobs SET status='sending',attempts=attempts+1 WHERE id=?").run(j.id);
 try{await provider('subscribers',subscriberPayload(c,j.list));const latest=get('contacts',c.id);if(latest){latest.mailketing_lists=[...new Set([...(latest.mailketing_lists||[]),String(j.list)])];latest.last_sync_at=Date.now();put('contacts',latest);}db.prepare("UPDATE syncjobs SET status='synced',error='' WHERE id=?").run(j.id);}
 catch(e){if([401,403,404].includes(e.providerStatus))db.prepare("INSERT OR REPLACE INTO settings VALUES('auto_sync','false')").run();const retry=(!e.providerStatus||e.providerStatus>=500||e.providerStatus===429)&&j.attempts<4;db.prepare('UPDATE syncjobs SET status=?,due=?,error=? WHERE id=?').run(retry?'queued':'failed',Date.now()+Math.min(3600000,60000*2**j.attempts),e.message,j.id);}
}
function matches(c,s){return (s.rules||[])[s.mode==='any'?'some':'every'](r=>{let v=r.field==='tag'?c.tags:r.field.startsWith('custom.')?c.custom[r.field.slice(7)]:c[r.field];if(r.field==='opened'||r.field==='clicked')v=db.prepare('SELECT COUNT(*) n FROM events WHERE contact=? AND type=?').get(c.id,r.field).n>0?'yes':'no';if(r.op==='contains')return Array.isArray(v)?v.includes(r.value):String(v||'').toLowerCase().includes(String(r.value).toLowerCase());if(r.op==='not')return String(v??'')!==String(r.value);return String(v??'')===String(r.value);});}
function contactHasHistory(id){return ['deals','orders','tasks','notes','tickets'].some(type=>all(type).some(x=>x.contact===id));}
function cancelContactJobs(c){if(['unsubscribed','bounced'].includes(c.status)&&!suppressed(c.email))db.prepare('INSERT OR IGNORE INTO suppressions VALUES(?,?)').run(c.email,c.status==='bounced'?'bounce':'unsubscribe');for(const table of ['jobs','syncjobs'])db.prepare(`UPDATE ${table} SET status='skipped',error='Kontak dihapus dari CRM' WHERE contact=? AND status='queued'`).run(c.id);audit(`contact data deleted: ${c.email}`);}
function deleteContact(c){if(contactHasHistory(c.id))fail('Kontak memiliki riwayat CRM. Arsipkan lifecycle sebagai inactive agar riwayat tetap tersedia.');cancelContactJobs(c);db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('contacts',c.id);}
function audience(c){if(c.audience_mode==='all')c={...c,include_tags:[],include_segments:[]};if(c.audience_mode==='filtered'&&!(c.include_tags?.length||c.include_segments?.length))fail('Pilih minimal satu include tag atau segmen.');return all('contacts').filter(p=>p.status==='active'&&p.consent&&!suppressed(p.email)&&(!(c.include_tags?.length||c.include_segments?.length)||(c.include_tags||[]).some(t=>p.tags.includes(t))||(c.include_segments||[]).some(id=>{const s=get('segments',id);return s&&matches(p,s);}))&&!(c.exclude_tags||[]).some(t=>p.tags.includes(t))&&!(c.exclude_segments||[]).some(id=>{const s=get('segments',id);return s&&matches(p,s);}));}
function enqueue(c,p,due=Date.now(),campaign='',owner=''){
 const template=p.template&&get('templates',p.template);if(template)p={...p,html:template.html};
 const id=uid();db.prepare('INSERT INTO jobs(id,contact,campaign,owner,status,due,payload,created) VALUES(?,?,?,?,?,?,?,?)').run(id,c.id,campaign,owner,'queued',due,JSON.stringify(p),Date.now());return id;
}
function event(c,type,data={},job=''){
 const eid=['contact_added','tag_added'].includes(type)?uid():hash(JSON.stringify([c.id,type,job?{link:data.link||''}:data,job]));if(db.prepare('SELECT id FROM events WHERE id=?').get(eid))return;
 db.prepare('INSERT INTO events VALUES(?,?,?,?,?,?)').run(eid,c.id,job,type,JSON.stringify(data),Date.now());
 if(type==='tag_added') for(const r of all('responders').filter(r=>r.active&&r.tag===data.tag)){let due=Date.now();for(const step of r.steps){due+=step.delay*60000;enqueue(c,{template:step.template,subject:step.subject,stop_on_reply:r.stop_on_reply!==false},due,'',r.id);}}
 for(const a of all('automations').filter(a=>a.active&&a.trigger===type&&(!a.tag||a.tag===data.tag))){
 let selected=a.action,actionTag=a.action_tag;
 if(a.condition){const r=a.condition,v=r.field==='tag'?c.tags:r.field==='replied'?(c.last_reply_at?'yes':'no'):String(c[r.field]||'');const match=r.op==='contains'?(Array.isArray(v)?v.includes(r.value):String(v).toLowerCase().includes(r.value.toLowerCase())):r.op==='not'?String(v)!==r.value:String(v)===r.value;if(!match){selected=a.else_action||'skip';actionTag=a.else_tag;}}
 if(selected==='skip')continue;
 enqueue(c,selected==='send'?{template:a.template,subject:a.subject,stop_on_reply:a.stop_on_reply!==false}:{action:selected,tag:actionTag,name:a.task_name||a.name,message:data.message||'',thread:data.thread||''},Date.now()+a.delay*60000,'',a.id);
 }

}
function launch(c){
 if(c.status!=='draft'&&c.status!=='scheduled')fail('Campaign sudah diproses.');const recipients=audience(c);if(!recipients.length)fail('Tidak ada kontak aktif yang memenuhi filter.');
 db.exec('BEGIN IMMEDIATE');try{for(const p of recipients)enqueue(p,{template:c.template,subject:c.subject,stop_on_reply:c.stop_on_reply!==false},Date.now(),c.id);c.status='running';c.recipients=recipients.length;c.started=Date.now();put('campaigns',c);audit(`campaign queued: ${c.id} (${recipients.length})`);db.exec('COMMIT');return c;}catch(e){db.exec('ROLLBACK');throw e;}
}
function signedToken(id){return `${id}.${sign(id)}`;}function checkToken(t){const [id,s]=String(t||'').split('.');return id&&s&&safeEqual(sign(id),s)?id:null;}
function emailHTML(t,c,job){let html=t.html.replace(/\{\{([\w.]+)\}\}/g,(_,k)=>escape(k==='name'?c.name:k==='email'?c.email:k==='phone'?c.phone:k==='site_name'?config().name:c.custom[k]||''));
 // Only HTTPS/HTTP links from saved content can become tracking redirects.
 html=html.replace(/href=["'](https?:\/\/[^"']+)["']/gi,(_,url)=>{const encoded=Buffer.from(url.replace(/&amp;/g,'&')).toString('base64url');return `href="${base}/click/${job}/${encoded}/${sign(job+'.'+encoded)}"`;});
 const unsub=`${base}/unsubscribe/${signedToken(c.id)}`;
 const footer=`<div style="padding:24px;text-align:center;font:12px Arial;color:#666">${escape(config().address)}<br><a href="${unsub}">Berhenti berlangganan</a></div><img alt="" width="1" height="1" src="${base}/open/${signedToken(job)}">`;
 return /<\/body>/i.test(html)?html.replace(/<\/body>/i,footer+'</body>'):`<html><body>${html}${footer}</body></html>`;
}
async function provider(path,payload){
 const cfg=config();if(!cfg.token)fail('Atur token Mailketing di Pengaturan → Koneksi & token.',503);let r,d;
 try{r=await fetch('https://api.mailketing.co.id/api/v2/'+path,{method:payload?'POST':'GET',headers:{Authorization:`Bearer ${cfg.token}`,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});}catch(e){throw Object.assign(Error('Koneksi Mailketing gagal atau melewati batas waktu. Periksa koneksi server, lalu coba kembali.'),{userHttp:503});}
 try{d=await r.json();}catch{throw Object.assign(Error('Respons Mailketing tidak dapat dibaca. Coba kembali atau periksa log provider.'),{providerStatus:r.status,userHttp:502,deliveryUnknown:true});}
 if(!r.ok||!d.success){const messages={401:'Token Mailketing tidak valid. Periksa token pada Pengaturan → Koneksi & token.',402:'Kredit Mailketing habis. Isi kredit sebelum mengirim.',403:'Domain pengirim belum dikenali atau akses tidak diizinkan. Periksa verifikasi domain Mailketing.',404:'List atau resource Mailketing tidak ditemukan. Muat ulang daftar list.',422:'Mailketing menolak data. Periksa email, nama, nomor telepon, dan list tujuan.',429:'Terlalu banyak request gagal. Tunggu beberapa menit sebelum mencoba lagi.'};const detail=String(d.message||'').split(cfg.token).join('[redacted]').slice(0,300);throw Object.assign(Error(messages[r.status]||`Mailketing belum dapat memproses permintaan (HTTP ${r.status}). ${detail}`),{providerStatus:r.status,userHttp:502});}
 return d.data;
}
let busy=false,stopping=false;
async function tick(){if(busy||stopping)return;busy=true;try{
 await tickSync();
 if(config().enabled){for(const c of all('campaigns').filter(c=>c.status==='scheduled'&&c.send_at<=Date.now())){try{launch(c);}catch(e){c.status='failed';c.error=e.message;put('campaigns',c);}}}
 const job=db.prepare(`SELECT j.* FROM jobs j LEFT JOIN records r ON r.id=j.owner AND r.kind IN ('responders','automations') WHERE j.status='queued' AND j.due<=? AND (r.id IS NULL OR json_extract(r.data,'$.active')=1) AND (?=1 OR json_extract(j.payload,'$.action') IS NOT NULL) ORDER BY j.due LIMIT 1`).get(Date.now(),config().enabled?1:0);if(!job)return;const p=JSON.parse(job.payload),c=get('contacts',job.contact);const owner=job.owner&&(get('responders',job.owner)||get('automations',job.owner));
 if(!c||(!['task','ticket'].includes(p.action)&&(c.status!=='active'||!c.consent||suppressed(c.email)))){db.prepare("UPDATE jobs SET status='skipped',error='Kontak tidak aktif' WHERE id=?").run(job.id);return;}
 const replyScope=job.campaign?'campaign:'+job.campaign:job.owner?'owner:'+job.owner:'direct';if(p.stop_on_reply&&c.reply_stops?.[replyScope]>=job.created){db.prepare("UPDATE jobs SET status='skipped',error='Pelanggan telah membalas' WHERE id=?").run(job.id);return;}
 if(owner&&!owner.active)return;if(!p.action&&!config().enabled)return;
 db.prepare("UPDATE jobs SET status='sending' WHERE id=? AND status='queued'").run(job.id);
 try{if(['task','ticket'].includes(p.action)){const kind=p.action==='task'?'tasks':'tickets';put(kind,validate(kind,{id:uid(),contact:c.id,name:p.name||'Tindak lanjut email',status:'open',priority:'normal',due:Date.now(),description:p.message?String(db.prepare('SELECT text FROM mail_messages WHERE id=?').get(p.message)?.text||'Balasan pelanggan').slice(0,5000):'Tindak lanjut automation',thread:p.thread||''}));db.prepare("UPDATE jobs SET status='done' WHERE id=?").run(job.id);}
 else if(p.action){const tags=new Set(c.tags);p.action==='tag'?tags.add(p.tag):tags.delete(p.tag);contact({...c,tags:[...tags]});db.prepare("UPDATE jobs SET status='done' WHERE id=?").run(job.id);}
 else {const t=p.html?{html:p.html}:get('templates',p.template);if(!t)fail('Template tidak ditemukan.');const cfg=config();if(!validEmail(cfg.from_email)||!cfg.from_name||!cfg.address)fail('Lengkapi pengirim dan alamat bisnis.');const message_id=`${job.id}@${cfg.from_email.split('@')[1]}`;
 db.prepare('UPDATE jobs SET message_id=? WHERE id=?').run(message_id,job.id);
 const result=await provider('send',{from_name:cfg.from_name,from_email:cfg.from_email,recipient:c.email,subject:p.subject.replace(/\{\{name\}\}/g,c.name),content:emailHTML(t,c,job.id),message_id});db.prepare("UPDATE jobs SET status='accepted',message_id=? WHERE id=?").run(result.message_id||message_id,job.id);
 }}catch(e){const status=e.deliveryUnknown?'uncertain':e.providerStatus===429?'queued':(e.status||e.providerStatus&&e.providerStatus<500)?'failed':'uncertain';db.prepare('UPDATE jobs SET status=?,error=?,due=? WHERE id=?').run(status,e.message,Date.now()+120000,job.id);if([401,402,403].includes(e.providerStatus))db.prepare("INSERT OR REPLACE INTO settings VALUES('enabled','false')").run();}
 for(const x of all('campaigns').filter(c=>c.status==='running')){if(!db.prepare("SELECT id FROM jobs WHERE campaign=? AND status IN ('queued','sending') LIMIT 1").get(x.id)){x.status='completed';put('campaigns',x);}}
 }finally{busy=false;}}
const interval=setInterval(()=>tick().catch(e=>console.error('Worker:',e.message)),Number(env.WORKER_INTERVAL_MS||1000));
const attempts=new Map();
function sessionUser(req){const token=(req.headers.cookie||'').match(/(?:^|;\s*)crm_session=([^;]+)/)?.[1];if(!token)return null;const s=db.prepare('SELECT * FROM sessions WHERE hash=?').get(hash(token));if(!s||s.expires<=Date.now())return null;if(!s.account)return {id:'primary',email:credentials.email(),role:'admin'};const user=accounts.get(s.account);return user?.enabled?{id:user.id,email:user.email,role:user.role}:null;}
const session=req=>!!sessionUser(req);
async function body(req){let b='';for await(const chunk of req){b+=chunk;if(Buffer.byteLength(b)>12*1024*1024)fail('Ukuran request maksimal 12 MB.',413);}try{return JSON.parse(b||'{}');}catch{fail('JSON tidak valid.');}}
const kinds=['contacts','tags','fields','segments','templates','campaigns','responders','automations','deals','orders','tasks','notes','tickets'];
function validate(k,d){if(['campaigns','responders','automations'].includes(k)&&d.stop_on_reply!==undefined&&typeof d.stop_on_reply!=='boolean')fail('Stop on reply harus boolean.');if(k==='automations'&&d.task_name!==undefined&&(typeof d.task_name!=='string'||d.task_name.length>255))fail('Nama tugas maksimal 255 karakter.');if(!d.name||typeof d.name!=='string'||d.name.length>255)fail('Nama wajib diisi (maks. 255 karakter).');if(['deals','orders','tasks','notes','tickets'].includes(k)){
 if(!get('contacts',d.contact))fail('Pilih kontak CRM yang valid.');
 if(k==='deals'){d.value=Number(d.value);if(!Number.isSafeInteger(d.value)||d.value<0||!stages.includes(d.stage))fail('Nilai peluang atau tahap tidak valid.');const old=get(k,d.id);if(['won','lost'].includes(d.stage))d.closed_at=old?.stage===d.stage?old.closed_at:Date.now();else d.closed_at=null;}
 if(k==='orders'){if(d.campaign&&!get('campaigns',d.campaign))fail('Campaign transaksi tidak ditemukan.');d.amount=Number(d.amount);if(!Number.isSafeInteger(d.amount)||d.amount<=0||!['paid','unpaid','refunded'].includes(d.status))fail('Nilai transaksi/status tidak valid.');if(d.status==='paid'&&(!Number.isFinite(d.paid_at)||d.paid_at<=0||d.paid_at>Date.now()))fail('Tanggal pembayaran tidak valid.');}
 if(k==='tasks'){if(!['open','done'].includes(d.status)||!Number.isFinite(d.due)||d.due<=0)fail('Status atau jadwal tugas tidak valid.');if(!['low','normal','high'].includes(d.priority))fail('Prioritas tidak valid.');}
 if(k==='notes'&&(!d.content||d.content.length>5000))fail('Isi catatan wajib diisi, maksimal 5.000 karakter.');
 if(k==='tickets'){if(!['open','in_progress','resolved'].includes(d.status)||!['low','normal','high'].includes(d.priority))fail('Status/prioritas keluhan tidak valid.');d.csat=d.csat?Number(d.csat):null;if(d.csat&&(!Number.isInteger(d.csat)||d.csat<1||d.csat>5||d.status!=='resolved'))fail('CSAT 1–5 hanya untuk keluhan selesai.');const old=get(k,d.id);d.resolved_at=d.status==='resolved'?(old?.resolved_at||Date.now()):null;if(!d.description||d.description.length>5000)fail('Isi keluhan wajib diisi, maksimal 5.000 karakter.');if(d.status==='resolved'&&!d.resolution?.trim())fail('Isi penyelesaian sebelum menutup keluhan.');}
 }if(k==='tags'&&!/^#[a-f0-9]{6}$/i.test(d.color||''))d.color='#2563eb';
 if(k==='fields'){if(!/^[a-z][a-z0-9_]{0,63}$/.test(d.key||''))fail('Key field: huruf kecil, angka, underscore.');if(all(k).some(f=>f.key===d.key&&f.id!==d.id))fail('Key field sudah ada.');if(!['text','number','date','email'].includes(d.type))fail('Tipe field tidak valid.');}
 if(k==='segments'){if(!Array.isArray(d.rules)||!d.rules.length)fail('Minimal satu aturan segmen.');for(const r of d.rules)if(!['tag','status','name','email','opened','clicked','lifecycle','company','source'].includes(r.field)&&!/^custom\.\w+$/.test(r.field))fail('Field aturan tidak valid.');}
 if(k==='templates'){if(d.design){d.design=normalizeDesign(d.design);d.html=renderDesign(d.design);d.blocks=d.design.blocks;}if(typeof d.html!=='string'||!d.html.trim()||d.html.length>300000)fail('HTML template wajib diisi (maks. 300 KB).');}
 if(k==='campaigns'){if(!get('templates',d.template)||!d.subject?.trim()||d.subject.length>998)fail('Pilih template dan isi subject.');if(d.audience_mode!==undefined&&!['all','filtered'].includes(d.audience_mode))fail('Pilihan penerima tidak valid.');if(d.audience_mode==='filtered'&&!(d.include_tags?.length||d.include_segments?.length))fail('Pilih minimal satu include tag atau segmen.');if(d.audience_mode==='all'){d.include_tags=[];d.include_segments=[];}d.status||='draft';if(!['draft','scheduled'].includes(d.status))fail('Status campaign tidak valid.');if(d.status==='scheduled'&&(!Number.isFinite(d.send_at)||d.send_at<=Date.now()))fail('Jadwal harus di masa depan.');}
 if(k==='responders'){if(!d.tag||!Array.isArray(d.steps)||!d.steps.length||d.steps.length>30)fail('Pilih tag dan 1–30 langkah.');for(const s of d.steps)if(!get('templates',s.template)||!s.subject?.trim()||!Number.isFinite(s.delay)||s.delay<0)fail('Langkah autoresponder tidak valid.');}
 if(k==='automations'){if(!['tag_added','contact_added','opened','clicked','replied'].includes(d.trigger)||!['send','tag','untag','task','ticket'].includes(d.action)||!Number.isFinite(d.delay)||d.delay<0)fail('Trigger/action/delay tidak valid.');if(d.action==='send'&&(!get('templates',d.template)||!d.subject?.trim()))fail('Pilih template dan subject.');if(['tag','untag'].includes(d.action)&&!get('tags',d.action_tag))fail('Pilih tag aksi.');if(d.condition){if(!['lifecycle','company','source','tag','replied'].includes(d.condition.field)||!['is','not','contains'].includes(d.condition.op)||typeof d.condition.value!=='string')fail('Kondisi automation tidak valid.');}if(d.else_action&&!['skip','task','tag'].includes(d.else_action))fail('Cabang alternatif tidak valid.');if(d.else_action==='tag'&&!get('tags',d.else_tag))fail('Pilih tag cabang alternatif.');}return d;}
function restoreConsent(c,evidence){db.prepare('DELETE FROM suppressions WHERE email=?').run(c.email);c={...c,status:'pending'};put('contacts',c);const restored=contact({...c,status:'active',consent:true,consent_evidence:evidence.trim().slice(0,1000)},false,true,true);restored.consent_at=Date.now();restored.consent_source='renewed consent';put('contacts',restored);audit(`consent restored: ${c.id}`);event(restored,'consent_restored',{});return restored;}
function mcpCall(name,a){
 const history=id=>{const c=get('contacts',id);if(!c)fail('Kontak tidak ditemukan.',404);return {contact:c,crm:Object.fromEntries(['deals','orders','tasks','notes','tickets'].map(k=>[k,all(k).filter(x=>x.contact===id)])),events:db.prepare('SELECT * FROM events WHERE contact=? ORDER BY created DESC LIMIT 100').all(id)};};
 const save=(kind,data)=>{const d=put(kind,validate(kind,{...data,id:uid()}));audit(`mcp ${name}: ${d.id}`);return d;};
 if(name==='create_template_draft'){const design=normalizeDesign(a.design);return save('templates',{name:a.name,design,html:renderDesign(design),blocks:design.blocks});}
 if(name==='inbox_summary')return inbox.list({q:a.query||''});
 if(name==='read_thread')return inbox.details(a.id);
 if(name==='create_reply_draft')return inbox.draft(a.thread,a.text);
 if(name==='search_contacts'){const limit=a.limit??100,offset=a.offset??0;if(limit<1||limit>200||offset<0)fail('limit 1–200; offset >= 0.');const query=(a.query||'').toLowerCase(),cs=all('contacts').filter(c=>(!a.status||c.status===a.status)&&JSON.stringify([c.email,c.name,c.phone,c.company,c.custom]).toLowerCase().includes(query));return {total:cs.length,contacts:cs.slice(offset,offset+limit)};}
 if(name==='contact_history')return history(a.id);
 if(name==='crm_catalog')return Object.fromEntries(['tags','fields','segments','templates'].map(k=>[k,all(k)]));
 if(name==='upsert_contact'){const old=all('contacts').find(c=>c.email===String(a.email).trim().toLowerCase());const c=contact({...a,custom:{...(old?.custom||{}),...(a.custom||{})}},false,false,true);audit(`mcp upsert_contact: ${c.id}`);return c;}
 if(name==='tag_contact'){const c=all('contacts').find(c=>c.email===a.email.toLowerCase());if(!c||!get('tags',a.tag))fail('Kontak/tag tidak ditemukan.');const tags=new Set(c.tags);a.remove?tags.delete(a.tag):tags.add(a.tag);const d=contact({...c,tags:[...tags]},false,false,true);audit(`mcp tag_contact: ${c.id}`);return d;}
 if(name==='create_tag')return save('tags',a);
 if(name==='create_custom_field')return save('fields',a);
 if(name==='add_note')return save('notes',{...a,channel:a.channel||'other'});
 if(name==='create_task')return save('tasks',{...a,status:'open',priority:a.priority||'normal'});
 if(name==='create_campaign_draft')return save('campaigns',{...a,status:'draft',audience_mode:a.include_tags?.length?'filtered':'all'});
 if(name==='preview_audience'){const cs=audience({audience_mode:a.include_tags?.length?'filtered':'all',include_tags:a.include_tags||[]});return {count:cs.length,samples:cs.slice(0,10).map(c=>({name:c.name,email:c.email}))};}
 if(name==='crm_report')return {crm:report(Object.fromEntries(kinds.map(k=>[k,all(k)])),0,Date.now()),email:{queued:db.prepare("SELECT COUNT(*) n FROM jobs WHERE status='queued'").get().n,accepted:db.prepare("SELECT COUNT(*) n FROM jobs WHERE status='accepted'").get().n}};
 fail('Tool tidak tersedia.');
}
const aiConfig=()=>{try{return JSON.parse(setting('ai_config')||'{"endpoint":"https://api.openai.com/v1","model":"","enabled":false}');}catch{return {enabled:false};}};
const mailboxConfig=()=>{try{return JSON.parse(setting('mailbox_config')||'{"enabled":false,"auto_sync":false,"port":993,"secure":true,"smtp_port":465,"smtp_secure":true,"folder":"INBOX","poll_minutes":5}');}catch{return {enabled:false};}};
const inbox=createInbox({db,settings:mailboxConfig,password:k=>credentials.secret(k),contactGet:id=>get('contacts',id),contactFor:(email,name)=>all('contacts').find(c=>c.email===email)||contact({email,name,source:'Mailbox',consent:false},false,false,true),audit,onIncoming:(c,data,matched)=>{
 if(!matched)return;
 c.last_reply_at=Math.max(c.last_reply_at||0,data.received);const source=data.job&&db.prepare('SELECT campaign,owner FROM jobs WHERE id=?').get(data.job);if(source){const key=source.campaign?'campaign:'+source.campaign:source.owner?'owner:'+source.owner:'direct';c.reply_stops={...(c.reply_stops||{}),[key]:Math.max(c.reply_stops?.[key]||0,data.received)};db.prepare("UPDATE jobs SET status='skipped',error='Pelanggan telah membalas' WHERE contact=? AND campaign=? AND owner=? AND status='queued' AND created<=? AND json_extract(payload,'$.stop_on_reply')=1").run(c.id,source.campaign,source.owner,data.received);}put('contacts',c);
 event(c,'replied',data,data.job||'');
}});
const inboxInterval=setInterval(()=>inbox.poll().catch(()=>{}),30000);inboxInterval.unref();
const oauth=createOAuth({db,base,audit,staticTokenConfigured:()=>!!credentials.secret('mcp_token'),sessionKey:req=>{const token=(req.headers.cookie||'').match(/(?:^|;\s*)oauth_session=([^;]+)/)?.[1]||(req.headers.cookie||'').match(/(?:^|;\s*)crm_session=([^;]+)/)?.[1];if(!token)return null;const key=hash(token),record=db.prepare('SELECT * FROM sessions WHERE hash=?').get(key);return record&&record.expires>Date.now()&&(!record.account||(accounts.get(record.account)?.enabled&&accounts.get(record.account)?.role==='admin'))?key:null;}});
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,base),path=u.pathname;res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
 const json=(d,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(d));};
 try{
 if(await oauth.route(req,res,u,json))return;
 if(path==='/api/mcp-settings')return await oauth.settings(req,res,json);
 if(path==='/mcp')return await handleMcp(req,res,{token:credentials.secret('mcp_token'),oauth,origin:base,safeEqual,body,call:mcpCall});
 if(path==='/health')return json({ok:true});
 if(path==='/api/login'&&req.method==='POST'){if(req.headers.origin&&req.headers.origin!==new URL(base).origin)fail('Origin tidak valid.',403);const ip=req.socket.remoteAddress;let a=attempts.get(ip);if(!a||a.until<Date.now())a={n:0,until:Date.now()+900000};if(a.n>=10)fail('Terlalu banyak percobaan. Tunggu 15 menit.',429);a.n++;attempts.set(ip,a);const b=await body(req);if(typeof b.password!=='string'||b.password.length>1024)fail('Password tidak valid.',401);const account=b.email===credentials.email()&&credentials.verifyPassword(b.password)?{id:''}:accounts.login(b.email,b.password);if(!account)fail('Email atau password salah.',401);attempts.delete(ip);const token=uid()+uid();db.prepare('INSERT INTO sessions(hash,expires,account) VALUES(?,?,?)').run(hash(token),Date.now()+43200000,account.id);res.setHeader('Set-Cookie',[`crm_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${base.startsWith('https:')?'; Secure':''}`,`oauth_session=${token}; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=43200${base.startsWith('https:')?'; Secure':''}`]);return json({ok:true});}
 if(path.startsWith('/unsubscribe/')){const id=checkToken(path.split('/')[2]),c=id&&get('contacts',id);if(!c)fail('Link tidak valid.',404);if(req.method==='POST'){suppress(c,'unsubscribe');event(c,'unsubscribed',{});res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<h2>Anda sudah berhenti berlangganan.</h2>');}res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<meta name="viewport" content="width=device-width"><div style="font:16px Arial;max-width:500px;margin:80px auto"><h2>Berhenti berlangganan?</h2><p>${escape(config().name)}</p><form method="POST"><button style="padding:12px">Konfirmasi berhenti berlangganan</button></form></div>`);}
 if(path.startsWith('/open/')){const id=checkToken(path.split('/')[2]),j=id&&db.prepare('SELECT * FROM jobs WHERE id=?').get(id),c=j&&get('contacts',j.contact);if(c)event(c,'opened',{},id);res.writeHead(200,{'Content-Type':'image/gif'});return res.end(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));}
 if(path.startsWith('/click/')){const [, ,id,encoded,s]=path.split('/');if(!safeEqual(sign(id+'.'+encoded),s))fail('Link tidak valid.',404);let target=Buffer.from(encoded,'base64url').toString();const dest=new URL(target);if(!['http:','https:'].includes(dest.protocol))fail('URL tidak valid.');const j=db.prepare('SELECT * FROM jobs WHERE id=?').get(id),c=j&&get('contacts',j.contact);if(!c)fail('Link tidak tersedia.',404);event(c,'clicked',{link:target},id);res.writeHead(302,{Location:target});return res.end();}
 if(path.startsWith('/webhook/')){
 if(!credentials.secret('webhook_secret')||!safeEqual(path.slice(9),credentials.secret('webhook_secret')))fail('Webhook tidak valid.',403);if(req.method!=='POST')fail('POST required.',405);
 const b=await body(req),email=String(b.email||'').trim().toLowerCase();if(!validEmail(email))fail('Email webhook tidak valid.',422);
 if(!['newsubscriber','emailopen','emailclick','bounce','unsubscribe'].includes(b.type))fail('Tipe webhook tidak didukung.',422);
 const delivery=hash(JSON.stringify(b));if(db.prepare('SELECT id FROM webhooks WHERE id=?').get(delivery))return json({ok:true,duplicate:true});
 db.exec('BEGIN IMMEDIATE');try{
 let c=all('contacts').find(c=>c.email===email);
 if(b.type==='newsubscriber'){
 const lists=[...new Set([...(c?.mailketing_lists||[]),String(b.list_id||'')].filter(Boolean))];
 c=contact({...c,email,name:[b.first_name,b.last_name].filter(Boolean).join(' ')||c?.name||'',phone:b.mobile||c?.phone||'',mailketing_lists:lists,mailketing_subscribed_at:b.date||'',consent:c?.consent===true,source:c?.source||'Mailketing webhook'},true,false,true);
 }else if(c){
 if(b.type==='bounce'||b.type==='unsubscribe')suppress(c,b.type);
 const normalized=String(b.message_id||'').trim().replace(/^<|>$/g,'');
 const j=normalized&&db.prepare("SELECT * FROM jobs WHERE trim(message_id,'<>')=? AND contact=?").get(normalized,c.id);
 const type={emailopen:'opened',emailclick:'clicked',bounce:'bounced',unsubscribe:'unsubscribed'}[b.type];
 const occurred=b.type==='emailopen'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(b.date||'')?Date.parse(b.date.replace(' ','T')+'Z'):null;
 event(c,type,{provider:true,date:b.date||'',occurred_at:occurred,link:b.link_clicked||'',reason:b.reason||'',message_id:normalized},j?.id||'');
 }
 db.prepare('INSERT INTO webhooks VALUES(?,?,?,?)').run(delivery,JSON.stringify(b),c?.id||'',Date.now());db.exec('COMMIT');return json({ok:true});
 }catch(e){db.exec('ROLLBACK');throw e;}
 }
 if(path.startsWith('/api/')){
 const apiAuth=credentials.secret('crm_token')&&safeEqual(req.headers.authorization||'',`Bearer ${credentials.secret('crm_token')}`);if(!session(req)&&!apiAuth)fail('Silakan login.',401);
 if(apiAuth&&!['/api/add-contact','/api/tag-contact','/api/contact','/api/remove-contact'].includes(path))fail('API token hanya untuk endpoint integrasi kontak.',403);
 if(!apiAuth&&!['GET','HEAD'].includes(req.method)&&req.headers.origin!==new URL(base).origin)fail('Origin tidak valid.',403);
 const user=sessionUser(req);if(!apiAuth&&user?.role!=='admin'){
 if(['/api/settings','/api/connection-settings','/api/ai-settings','/api/mailbox-settings','/api/team','/api/backup','/api/mailbox-test','/api/smtp-test','/api/sync-settings','/api/restore-consent','/api/bulk-restore-consent','/api/campaign-action','/api/retry'].includes(path))fail('Akses ini memerlukan admin.',403);
 if(user?.role==='viewer'&&!['GET','HEAD'].includes(req.method)&&path!=='/api/logout')fail('Akun viewer hanya dapat membaca.',403);
 }
 if(['/api/bulk-sync-contacts','/api/bulk-tag-contacts','/api/import-preview','/api/bulk-delete-contacts','/api/logout','/api/activate-contact','/api/restore-consent','/api/bulk-restore-consent','/api/settings','/api/import','/api/queue-test','/api/preview-audience','/api/campaign-action','/api/retry','/api/sync-settings','/api/sync-retry'].includes(path)&&req.method!=='POST')fail('POST required.',405);
 if(path==='/api/logout'){const token=(req.headers.cookie||'').match(/crm_session=([^;]+)/)?.[1];if(token)db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token));res.setHeader('Set-Cookie',['crm_session=; Path=/; Max-Age=0','oauth_session=; Path=/oauth; Max-Age=0']);return json({ok:true});}
 if(path==='/api/team'){
 if(req.method==='GET')return json({users:accounts.list(),primary_email:credentials.email()});if(req.method!=='POST')fail('POST required.',405);const b=await body(req);if(!credentials.verifyPassword(b.current_password))fail('Password admin utama salah.',403);try{const result=accounts.save(b);audit('team account updated');return json(result);}catch(error){fail(error.message);}
 }
 if(path==='/api/backup'){
 if(req.method!=='POST')fail('POST required.',405);const b=await body(req);if(!credentials.verifyPassword(b.current_password))fail('Password admin utama salah.',403);const file=(env.DATA_DIR||'./data')+'/backup-'+uid()+'.sqlite';try{db.prepare('VACUUM INTO ?').run(file);const bytes=readFileSync(file);audit('database backup downloaded');res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition','attachment; filename="mailk-backup-'+new Date().toISOString().slice(0,10)+'.sqlite"');return res.end(bytes);}finally{rmSync(file,{force:true});}
 }
 if(path==='/api/ai-settings'){
 if(req.method==='GET')return json({...aiConfig(),configured:!!credentials.secret('ai_key')});
 if(req.method!=='POST')fail('POST required.',405);const b=await body(req);if(!credentials.verifyPassword(b.current_password))fail('Password admin salah.',403);const cfg=await checked(()=>validateAISettings(b));if(b.key!==undefined&&(typeof b.key!=='string'||b.key.length>4096||/[\r\n]/.test(b.key)))fail('API key tidak valid.');db.exec('BEGIN');try{if(b.key!==undefined)credentials.setSecret('ai_key',b.key.trim());db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('ai_config',JSON.stringify(cfg));audit('AI settings updated');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return json({ok:true});
 }
 if(path==='/api/ai-generate'){
 if(req.method!=='POST')fail('POST required.',405);const b=await body(req);let context={};if(b.contact){const c=get('contacts',b.contact);if(!c)fail('Kontak tidak ditemukan.',404);context={contact:{name:c.name,email:c.email,company:c.company,lifecycle:c.lifecycle,custom:c.custom},notes:all('notes').filter(n=>n.contact===c.id).slice(-10).map(n=>({content:n.content})),tasks:all('tasks').filter(n=>n.contact===c.id).slice(-10).map(n=>({name:n.name,status:n.status}))};}if(b.thread){const t=inbox.details(b.thread);context={...context,thread:{subject:t.subject,messages:t.messages.slice(-12).map(m=>({direction:m.direction,text:m.text.slice(0,8000)}))}};}if(['segment','plan'].includes(b.mode))context={...context,tags:all('tags').map(t=>({id:t.id,name:t.name})),fields:all('fields').map(t=>({key:t.key,type:t.type}))};const output=await checked(()=>generateAI({settings:aiConfig(),key:credentials.secret('ai_key'),mode:b.mode,prompt:b.prompt,context}),502);audit('AI draft generated: '+b.mode);return json(output);
 }
 if(path==='/api/mailbox-settings'){
 if(req.method==='GET')return json({...mailboxConfig(),imap_configured:!!credentials.secret('imap_password'),smtp_configured:!!credentials.secret('smtp_password'),sync:inbox.status()});
 if(req.method!=='POST')fail('POST required.',405);if(inbox.isSyncing())fail('Tunggu sinkronisasi selesai sebelum mengubah mailbox.',409);const b=await body(req);if(!credentials.verifyPassword(b.current_password))fail('Password admin salah.',403);const cfg=await checked(()=>validateMailbox(b));for(const k of ['imap_password','smtp_password'])if(b[k]!==undefined&&(typeof b[k]!=='string'||b[k].length>4096||/[\r\n]/.test(b[k])))fail('Password mailbox tidak valid.');db.exec('BEGIN');try{for(const k of ['imap_password','smtp_password'])if(b[k]!==undefined)credentials.setSecret(k,b[k]);db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('mailbox_config',JSON.stringify(cfg));audit('mailbox settings updated');db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return json({ok:true});
 }
 if(path==='/api/inbox')return json(inbox.list({q:String(u.searchParams.get('q')||'').slice(0,200),status:u.searchParams.get('status'),offset:Math.max(0,Math.min(100000,Number(u.searchParams.get('offset'))||0))}));
 if(path==='/api/thread'){const id=u.searchParams.get('id');const details=inbox.details(id);if(req.method==='GET')return json(details);if(req.method!=='POST')fail('POST required.',405);return json(inbox.update(id,await body(req)));}
 if(['/api/mailbox-sync','/api/mailbox-test','/api/smtp-test','/api/reply-draft','/api/reply-send','/api/thread-followup'].includes(path)){
 if(req.method!=='POST')fail('POST required.',405);const b=await body(req);
 if(path==='/api/mailbox-sync')return json(await checked(()=>inbox.sync(),503));if(path==='/api/mailbox-test')return json(await checked(()=>inbox.sync(true),503));if(path==='/api/smtp-test')return json(await checked(()=>inbox.smtpTest(),503));
 if(path==='/api/reply-draft')return json(await checked(()=>inbox.draft(b.thread,b.text)));
 if(path==='/api/reply-send'){if(b.confirmed!==true)fail('Konfirmasi pengiriman balasan.');return json(await checked(()=>inbox.send(b.id),502));}
 const t=inbox.details(b.thread),c=get('contacts',t.contact);if(!c)fail('Kontak tidak ditemukan.');const kind=b.kind==='ticket'?'tickets':'tasks';const data={id:uid(),contact:c.id,name:String(b.name||t.subject).slice(0,255),status:'open',priority:'normal',due:Date.now()+86400000,description:String(t.messages.filter(m=>m.direction==='inbound').at(-1)?.text||t.subject).slice(0,5000),thread:t.id};const result=put(kind,validate(kind,data));audit('follow-up created from inbox');return json(result);
 }
 if(path==='/api/attachment'){const a=inbox.attachment(u.searchParams.get('id'));if(!a)fail('Lampiran tidak ditemukan.',404);res.setHeader('Content-Type','application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition','attachment; filename="'+a.name.replace(/[^a-zA-Z0-9._-]/g,'_')+'"');return res.end(a.content);}
 if(path==='/api/campaign-insights'){return json(all('campaigns').map(c=>{const accepted=db.prepare("SELECT COUNT(*) n FROM jobs WHERE campaign=? AND status='accepted'").get(c.id).n,opened=db.prepare("SELECT COUNT(DISTINCT e.job) n FROM events e JOIN jobs j ON j.id=e.job WHERE j.campaign=? AND e.type='opened'").get(c.id).n,clicked=db.prepare("SELECT COUNT(DISTINCT e.job) n FROM events e JOIN jobs j ON j.id=e.job WHERE j.campaign=? AND e.type='clicked'").get(c.id).n,replies=db.prepare("SELECT COUNT(DISTINCT t.contact) n FROM mail_messages m JOIN mail_threads t ON t.id=m.thread WHERE m.campaign=? AND m.direction='inbound'").get(c.id).n;const revenue=all('orders').filter(o=>o.campaign===c.id&&o.status==='paid').reduce((n,o)=>n+o.amount,0);return {id:c.id,name:c.name,accepted,opened,clicked,replies,revenue};}));}
 if(path==='/api/connection-settings'){
 if(req.method==='GET')return json({admin_email:credentials.email(),secrets:credentials.status()});
 if(req.method!=='POST')fail('POST required.',405);
 const b=await body(req);if(!b||typeof b!=='object'||Array.isArray(b))fail('Pengaturan tidak valid.');
 if(!credentials.verifyPassword(b.current_password))fail('Password admin saat ini salah.',403);
 const values=b.secrets||{};if(typeof values!=='object'||Array.isArray(values))fail('Token tidak valid.');
 for(const [k,v] of Object.entries(values)){if(!Object.hasOwn(credentials.status(),k)||typeof v!=='string'||v.length>4096||(v&&(/[\r\n]/.test(v)||v!==v.trim())))fail('Token tidak valid.');if(v&&['crm_token','mcp_token','webhook_secret'].includes(k)&&v.length<32)fail('Token CRM/MCP dan webhook minimal 32 karakter.');}
 if(b.admin_email!==undefined&&(!validEmail(b.admin_email)||accounts.list().some(a=>a.email===b.admin_email.toLowerCase())))fail('Email admin tidak valid.');
 if(b.new_password!==undefined&&(typeof b.new_password!=='string'||b.new_password.length<12||b.new_password.length>1024))fail('Password baru minimal 12 karakter.');
 db.exec('BEGIN');try{
 for(const [k,v] of Object.entries(values))credentials.setSecret(k,v);
 if(b.admin_email!==undefined)credentials.setEmail(b.admin_email);
 if(b.new_password!==undefined)credentials.setPassword(b.new_password);
 if(Object.hasOwn(values,'mailketing_token')){db.prepare("INSERT OR REPLACE INTO settings VALUES('enabled','false')").run();db.prepare("INSERT OR REPLACE INTO settings VALUES('auto_sync','false')").run();}
 const relogin=b.admin_email!==undefined||b.new_password!==undefined;
 if(relogin){db.prepare('DELETE FROM sessions').run();db.prepare('UPDATE oauth_grants SET revoked=1').run();db.prepare('DELETE FROM oauth_codes').run();db.prepare('DELETE FROM oauth_transactions').run();}
 audit('connection or account settings updated');db.exec('COMMIT');return json({ok:true,relogin});
 }catch(error){db.exec('ROLLBACK');throw error;}
 }
 if(path==='/api/suppressions')return json(db.prepare('SELECT email,reason FROM suppressions ORDER BY email').all());
 if(path==='/api/bulk-restore-consent'){
 const b=await body(req);if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>10000||b.ids.some(id=>typeof id!=='string'||!/^[a-f0-9]+$/.test(id)))fail('Pilih 1–10.000 ID kontak yang valid.');
 const ids=[...new Set(b.ids)],contacts=new Map(all('contacts').map(c=>[c.id,c])),blocked=new Map(db.prepare('SELECT email,reason FROM suppressions').all().map(x=>[x.email,x.reason]));
 const counts={selected:ids.length,eligible:0,bounced:0,other:0,missing:0},eligible=[];
 for(const id of ids){const c=contacts.get(id);if(!c){counts.missing++;continue;}if(c.status==='bounced'||blocked.get(c.email)==='bounce'){counts.bounced++;continue;}if(c.status==='unsubscribed'){counts.eligible++;eligible.push(c);}else counts.other++;}
 if(b.preview===true)return json(counts);
 if(b.confirmed!==true||typeof b.evidence!=='string'||b.evidence.trim().length<5)fail('Verifikasi semua kontak eligible dan isi bukti persetujuan terbaru.');
 const result={...counts,restored:0,errors:[]};db.exec('BEGIN');try{for(const c of eligible){db.exec('SAVEPOINT restore_contact');try{restoreConsent(c,b.evidence);db.exec('RELEASE restore_contact');result.restored++;}catch(err){db.exec('ROLLBACK TO restore_contact');db.exec('RELEASE restore_contact');result.errors.push({id:c.id,email:c.email,message:err.message});}}audit(`bulk consent restored: ${result.restored}, errors ${result.errors.length}`);db.exec('COMMIT');}catch(err){db.exec('ROLLBACK');throw err;}return json({...result,message:`${result.restored} kontak dipulihkan. ${counts.bounced} bounce, ${counts.other} status lain dan ${counts.missing} tidak ditemukan dilewati. ${result.errors.length} gagal validasi.`});
 }
 if(path==='/api/restore-consent'){
 const b=await body(req),c=get('contacts',b.id);if(!c)fail('Kontak tidak ditemukan.',404);
 if(b.confirmed!==true||typeof b.evidence!=='string'||b.evidence.trim().length<5)fail('Verifikasi ulang dan catatan bukti persetujuan wajib diisi.');
 const reason=db.prepare('SELECT reason FROM suppressions WHERE email=?').get(c.email)?.reason;
 if(c.status==='bounced'||reason==='bounce')fail('Kontak bounce tidak dapat dipulihkan melalui persetujuan ulang.');
 if(c.status!=='unsubscribed')fail('Gunakan verifikasi consent untuk kontak pending.');
 db.exec('BEGIN');try{const restored=restoreConsent(c,b.evidence);db.exec('COMMIT');return json(restored);}catch(err){db.exec('ROLLBACK');throw err;}
 }
 if(path==='/api/state'){const data=Object.fromEntries(kinds.map(k=>[k,all(k)]));data.jobs=db.prepare('SELECT * FROM jobs ORDER BY created DESC LIMIT 500').all().map(j=>{const {html,...summary}=JSON.parse(j.payload);return {...j,payload:JSON.stringify(summary)};});data.events=db.prepare('SELECT * FROM events ORDER BY created DESC LIMIT 200').all();data.audit=db.prepare('SELECT * FROM audit ORDER BY created DESC LIMIT 100').all();data.metrics={accepted:db.prepare("SELECT COUNT(*) n FROM jobs WHERE status='accepted'").get().n,opened:db.prepare("SELECT COUNT(DISTINCT events.job) n FROM events JOIN jobs ON events.job=jobs.id WHERE events.type='opened' AND jobs.status='accepted'").get().n,queued:db.prepare("SELECT COUNT(*) n FROM jobs WHERE status='queued'").get().n};data.user=user;data.config={...config(),token:undefined,connected:!!config().token,webhook_url:user?.role==='admin'&&credentials.secret('webhook_secret')?`${base}/webhook/${credentials.secret('webhook_secret')}`:'',api_configured:!!credentials.secret('crm_token'),mcp_configured:!!credentials.secret('mcp_token')||oauth.available(),mcp_oauth_enabled:oauth.enabled(),mcp_url:base+'/mcp'};for(const s of data.segments)s.count=data.contacts.filter(c=>matches(c,s)).length;return json(data);}
 if(path==='/api/crm-report'){const from=Number(u.searchParams.get('from')),to=Number(u.searchParams.get('to'));if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)fail('Periode laporan tidak valid.');return json(report(Object.fromEntries(['contacts','deals','orders','tasks','tickets'].map(k=>[k,all(k)])),from,to));}
 if(path==='/api/sync-settings'){const b=await body(req);if(typeof b.auto_sync!=='boolean'||!Number.isSafeInteger(Number(b.default_list))||Number(b.default_list)<=0)fail('Pilih list dan status sinkronisasi yang valid.');const lists=normaliseLists(await provider('lists'));if(!lists.some(l=>l.id===Number(b.default_list)))fail('List tidak ditemukan di akun Mailketing.');db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('default_list',String(b.default_list));db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('auto_sync',String(b.auto_sync));if(b.auto_sync)for(const c of all('contacts'))queueSync(c);audit('automatic subscriber sync configured');return json({message:b.auto_sync?'Sinkronisasi otomatis aktif. Kontak eligible masuk antrean.':'Sinkronisasi otomatis dijeda.'});}
 if(path==='/api/sync-retry'){const b=await body(req);if(typeof b.id!=='string')fail('Pilih job sync.');const j=db.prepare('SELECT * FROM syncjobs WHERE id=?').get(b.id);if(!j||!['failed','skipped'].includes(j.status))fail('Job tidak dapat dicoba ulang.');const c=get('contacts',j.contact);if(!c||c.status!=='active'||!c.consent||suppressed(c.email)||j.list!==config().default_list)fail('Kontak/list tidak lagi memenuhi pengaturan sync.');db.prepare("UPDATE syncjobs SET status='queued',due=?,attempts=0,error='' WHERE id=?").run(Date.now(),j.id);return json({message:'Sinkronisasi masuk antrean ulang.'});}
 if(path==='/api/sync-diagnostics'){const hooks=db.prepare('SELECT contact,payload,created FROM webhooks ORDER BY created DESC LIMIT 20').all().map(h=>{const b=JSON.parse(h.payload);return {type:b.type,email:b.email,list_id:b.list_id||'',created:h.created};});return json({counts:db.prepare('SELECT status,COUNT(*) n FROM syncjobs GROUP BY status').all(),auto_sync:config().auto_sync,default_list:config().default_list,jobs:db.prepare('SELECT * FROM syncjobs ORDER BY created DESC LIMIT 100').all(),webhooks:hooks});}
 if(path==='/api/activate-contact'){
 const b=await body(req),c=get('contacts',b.id);if(!c)fail('Kontak tidak ditemukan.',404);if(c.status!=='pending'||suppressed(c.email))fail('Hanya kontak pending tanpa suppression yang dapat diaktifkan.');
 if(b.confirmed!==true||typeof b.evidence!=='string'||b.evidence.trim().length<5)fail('Konfirmasi persetujuan dan catatan bukti wajib diisi.');
 const result=contact({...c,status:'active',consent:true,consent_evidence:b.evidence.trim().slice(0,1000),consent_at:Date.now(),source:c.source||'manual'},true,true);audit(`consent verified: ${c.id}`);return json(result);
 }
 if(path==='/api/contact-history'){const c=get('contacts',u.searchParams.get('id'));if(!c)fail('Kontak tidak ditemukan.',404);return json({contact:c,threads:db.prepare('SELECT * FROM mail_threads WHERE contact=? ORDER BY updated DESC LIMIT 50').all(c.id),crm:Object.fromEntries(['deals','orders','tasks','notes','tickets'].map(k=>[k,all(k).filter(x=>x.contact===c.id)])),events:db.prepare('SELECT * FROM events WHERE contact=? ORDER BY created DESC LIMIT 250').all(c.id),jobs:db.prepare('SELECT id,campaign,owner,status,due,error FROM jobs WHERE contact=? ORDER BY created DESC LIMIT 250').all(c.id)});}
 if(path==='/api/segment-contacts'){const s=get('segments',u.searchParams.get('id'));if(!s)fail('Segmen tidak ditemukan.',404);return json(all('contacts').filter(c=>matches(c,s)));}
 if(path==='/api/contact'){return json(all('contacts').find(c=>c.email===u.searchParams.get('email'))||null);}
 if(path==='/api/bulk-delete-contacts'){
 const b=await body(req);if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>10000||b.ids.some(id=>typeof id!=='string'||!/^[a-f0-9]+$/.test(id)))fail('Pilih 1–10.000 ID kontak yang valid.');
 const ids=[...new Set(b.ids)],protectedIds=new Set(['deals','orders','tasks','notes','tickets'].flatMap(k=>all(k).map(x=>x.contact))),contacts=new Map(all('contacts').map(c=>[c.id,c]));
 const eligible=ids.filter(id=>contacts.has(id)&&!protectedIds.has(id)),protectedCount=ids.filter(id=>contacts.has(id)&&protectedIds.has(id)).length,missing=ids.filter(id=>!contacts.has(id)).length;
 const report={selected:ids.length,deletable:eligible.length,protected:protectedCount,missing};if(b.preview===true)return json(report);if(b.confirmed!==true)fail('Konfirmasi penghapusan diperlukan.');
 db.exec('BEGIN');try{for(const id of eligible){const c=contacts.get(id);cancelContactJobs(c);db.prepare('DELETE FROM records WHERE kind=? AND id=?').run('contacts',id);}audit(`bulk delete contacts ${eligible.length}, protected ${protectedCount}, missing ${missing}`);db.exec('COMMIT');}catch(err){db.exec('ROLLBACK');throw err;}
 return json({...report,deleted:eligible.length,message:`${eligible.length} kontak dihapus. ${protectedCount} dilindungi karena memiliki riwayat CRM. ${missing} sudah tidak ditemukan.`});
 }
 if(path==='/api/add-contact'){if(req.method!=='POST')fail('POST required.',405);return json(contact(await body(req)));}
 if(path==='/api/tag-contact'){if(req.method!=='POST')fail('POST required.',405);const b=await body(req),c=all('contacts').find(c=>c.email===b.email);if(!c)fail('Kontak tidak ditemukan.',404);const tags=new Set(c.tags);if(b.tag)tags.add(b.tag);if(b.untag)tags.delete(b.untag);return json(contact({...c,tags:[...tags]}));}
 if(path==='/api/remove-contact'){if(req.method!=='POST')fail('POST required.',405);const b=await body(req),c=all('contacts').find(c=>c.email===b.email);if(c)deleteContact(c);return json({ok:true});}
 if(path.startsWith('/api/provider/')){const p=path.split('/').pop();if(!['credits','senders','lists'].includes(p))fail('Endpoint tidak valid.');const d=await provider(p);return json(p==='senders'?{senders:normaliseSenders(d)}:p==='lists'?{lists:normaliseLists(d).map(l=>({list_id:l.id,list_name:l.name}))}:d);}
 if(path==='/api/sync'){
 if(req.method!=='POST')fail('POST required.',405);const b=await body(req);
 if(typeof b.contact!=='string'||!b.contact)fail('Belum ada kontak yang dipilih. Tambahkan atau import kontak aktif terlebih dahulu.');
 const list=Number(b.list_id);if(!Number.isSafeInteger(list)||list<=0)fail('Pilih list Mailketing yang valid.');
 const c=get('contacts',b.contact);if(!c||c.status!=='active'||!c.consent||suppressed(c.email))fail('Pilih kontak aktif yang sudah memiliki persetujuan menerima email.');
 const result=await provider('subscribers',subscriberPayload(c,list));
 c.mailketing_lists=[...new Set([...(c.mailketing_lists||[]),String(list)])];c.last_sync_at=Date.now();put('contacts',c);audit(`subscriber synced: ${c.id} to list ${list}`);
 return json({status:result.status||'added',message:result.status==='already_exists'?'Kontak sudah ada di list Mailketing.':'Kontak berhasil ditambahkan ke list Mailketing.'});
 }
 if(path==='/api/settings'){if(req.method!=='POST')fail('POST required.',405);const b=await body(req);if(b.from_email!==undefined&&!validEmail(b.from_email))fail('Email pengirim tidak valid.');if(b.enabled!==undefined&&typeof b.enabled!=='boolean')fail('Status pengiriman harus true/false.');for(const k of ['name','from_name','from_email','address','enabled'])if(b[k]!==undefined)db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(k,String(b[k]).slice(0,1000));audit('settings updated');return json({ok:true});}
 if(path==='/api/import-history')return json(all('import_batches').sort((a,b)=>b.created-a.created).slice(0,30).map(({errors,conflicts,...b})=>({...b,error_count:errors.length,conflict_count:conflicts.length})));
 if(path==='/api/import-batch'){const batch=get('import_batches',u.searchParams.get('id'));if(!batch)fail('Batch tidak ditemukan.',404);return json(batch);}
 if(path==='/api/import'||path==='/api/import-preview'){
 const b=await body(req);if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>10000)fail('Pilih 1–10.000 baris per import.');if(b.consent===true&&(!b.evidence||typeof b.evidence!=='string'||b.evidence.trim().length<5))fail('Catatan bukti persetujuan wajib diisi.');if(b.tags!==undefined&&(!Array.isArray(b.tags)||b.tags.some(t=>!get('tags',t))))fail('Tag tidak valid.');
 let plan;try{plan=importPlan(b.rows,all('contacts'),b.mode||'fill',String(b.source||'CSV').slice(0,255));}catch(e){fail(e.message);}
 if(path==='/api/import-preview'){
 const status_counts={active:0,pending:0,unsubscribed:0,bounced:0};const samples=plan.operations.map(x=>{const previous=all('contacts').find(c=>c.email===x.data.email),reason=db.prepare('SELECT reason FROM suppressions WHERE email=?').get(x.data.email)?.reason;const status=reason?(reason==='bounce'?'bounced':'unsubscribed'):previous?.status||((b.consent===true)?'active':'pending');status_counts[status]++;return {row:x.row,...x.data,status,status_reason:reason?'Diblokir: '+reason:previous?'Status kontak yang sudah ada dipertahankan':b.consent?'Persetujuan impor tercatat':'Belum ada persetujuan'};});
 return json({...plan.summary,status_counts,errors:plan.errors,conflicts:plan.conflicts,warnings:plan.warnings,samples:samples.slice(0,10)});
 }
 if(plan.warnings.length&&b.mapping_confirmed!==true)fail('Periksa mapping nama–telepon lalu konfirmasikan hasil preview.');
 const result={id:uid(),created:Date.now(),filename:String(b.filename||'CSV').slice(0,255),mode:b.mode||'fill',source:String(b.source||'CSV').slice(0,255),added:0,updated:0,skipped:plan.summary.skipped,duplicates:plan.summary.duplicates,errors:[...plan.errors],conflicts:plan.conflicts};
 db.exec('BEGIN IMMEDIATE');try{for(const op of plan.operations){db.exec('SAVEPOINT import_row');try{
 const previous=all('contacts').find(c=>c.email===op.data.email);const data={...op.data,id:previous?.id,tags:[...new Set([...(previous?.tags||[]),...(b.tags||[])])],consent:previous?.consent===true||b.consent===true};
 // A CSV cannot silently reactivate pending/unsubscribed/bounced contacts.
 if(!previous&&b.consent===true)data.consent_evidence=b.evidence.trim().slice(0,1000);
 const c=contact(data);c.import_batch=result.id;put('contacts',c);result[previous?'updated':'added']++;db.exec('RELEASE import_row');
 }catch(e){db.exec('ROLLBACK TO import_row');db.exec('RELEASE import_row');result.errors.push({row:op.row,email:op.data.email,message:e.message});}}
 put('import_batches',{...result,updated_count:result.updated});audit(`CSV batch ${result.id}: ${result.added} new, ${result.updated} updated, ${result.skipped} skipped`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(result);
 }
 if(path==='/api/preview-audience'){const b=await body(req),recipients=audience(b);return json({count:recipients.length,ineligible:all('contacts').filter(c=>c.status!=='active'||!c.consent||suppressed(c.email)).length,samples:recipients.slice(0,10).map(({name,email})=>({name,email}))});}
 if(path==='/api/bulk-tag-contacts'||path==='/api/bulk-sync-contacts'){
 const b=await body(req);if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>10000||b.ids.some(id=>typeof id!=='string'))fail('Pilih 1–10.000 kontak.');const cs=[...new Set(b.ids)].map(id=>get('contacts',id)).filter(Boolean);
 if(path==='/api/bulk-tag-contacts'){if(!get('tags',b.tag))fail('Pilih tag valid.');db.exec('BEGIN');try{for(const c of cs)contact({...c,tags:[...new Set([...c.tags,b.tag])]});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json({message:`Tag ditambahkan ke ${cs.length} kontak.`});}
 const cfg=config();if(!cfg.auto_sync||!cfg.default_list)fail('Aktifkan sinkronisasi otomatis dan pilih list tujuan pada Integrasi terlebih dahulu.');let queued=0,skipped=0,existing=0;
 for(const c of cs){if(c.status!=='active'||!c.consent||suppressed(c.email)){skipped++;continue;}if((c.mailketing_lists||[]).includes(String(cfg.default_list))){existing++;continue;}const before=db.prepare('SELECT id,status FROM syncjobs WHERE contact=? AND list=?').get(c.id,cfg.default_list);if(before){existing++;continue;}queueSync(c);queued++;}
 audit(`bulk sync: ${queued} queued to ${cfg.default_list}`);return json({queued,skipped,existing,message:`${queued} masuk antrean, ${skipped} tidak memenuhi syarat, ${existing} sudah terhubung/dalam antrean. List ID ${cfg.default_list}.`});
 }
 if(path==='/api/queue-test'){const b=await body(req);if(!get('templates',b.template)||!validEmail(b.email)||!b.subject)fail('Template/email/subject tidak valid.');const previous=all('contacts').find(c=>c.email===b.email.toLowerCase());const c=previous||contact({email:b.email,name:'Test',consent:true,source:'Manual test'});if(c.status!=='active')fail('Alamat test masuk suppression.');return json({id:enqueue(c,{template:b.template,subject:b.subject})});}
 if(path==='/api/campaign-action'){const b=await body(req),c=get('campaigns',b.id);if(!c)fail('Campaign tidak ditemukan.',404);if(b.action==='launch'){if(!config().enabled)fail('Aktifkan pengiriman di Settings terlebih dahulu.');return json(launch(c));}if(b.action==='cancel'){db.prepare("UPDATE jobs SET status='cancelled' WHERE campaign=? AND status='queued'").run(c.id);c.status='cancelled';put('campaigns',c);return json(c);}fail('Aksi tidak valid.');}
 if(path==='/api/retry'){const b=await body(req),j=db.prepare('SELECT * FROM jobs WHERE id=?').get(b.id);if(!j||!['failed','uncertain'].includes(j.status))fail('Job tidak dapat dicoba ulang.');if(j.status==='uncertain'&&!b.reconciled)fail('Konfirmasi hasil provider sebelum retry.');db.prepare("UPDATE jobs SET status='queued',error='',due=? WHERE id=?").run(Date.now(),j.id);audit(`manual retry ${j.id}`);return json({ok:true});}
 const m=path.match(/^\/api\/records\/([a-z]+)(?:\/([a-f0-9]+))?$/);if(m&&kinds.includes(m[1])){const [_,k,id]=m;const old=id&&get(k,id);if(req.method==='DELETE'){if(!id||!old)fail('Data tidak ditemukan.',404);if(old&&k==='contacts'){deleteContact(old);}if(['responders','automations'].includes(k))db.prepare("UPDATE jobs SET status='cancelled' WHERE owner=? AND status='queued'").run(id);if(['tags','fields','templates'].includes(k)){const refs=all('campaigns').concat(all('responders'),all('automations'));if(refs.some(r=>JSON.stringify(r).includes(id)))fail('Masih digunakan campaign/automation.');}db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(k,id);audit(`delete ${k} ${id}`);return json({ok:true});}
 if(req.method==='POST'||req.method==='PUT'){if(k==='campaigns'&&old&&!['draft','scheduled'].includes(old.status))fail('Campaign yang sudah dijalankan tidak bisa diedit.');const b=await body(req);delete b.created;delete b.updated;b.id=id||(k==='contacts'?undefined:uid());if(id&&!old)fail('Data tidak ditemukan.',404);const d=k==='contacts'?contact({...old,...b}):put(k,validate(k,{...old,...b}));if((k==='deals'&&d.stage==='won')||(k==='orders'&&d.status==='paid')){const c=get('contacts',d.contact);contact({...c,lifecycle:'customer'});}if(['deals','orders','tasks','notes','tickets'].includes(k)){const c=get('contacts',d.contact);event(c,'crm_'+k,{id:d.id,status:d.stage||d.status||'saved'});}if(k==='responders'&&b.existing===true&&!old&&d.active){for(const c of all('contacts').filter(c=>c.tags.includes(d.tag)&&c.status==='active'&&c.consent)){let due=Date.now();for(const s of d.steps){due+=s.delay*60000;enqueue(c,{template:s.template,subject:s.subject},due,'',d.id);}}}audit(`save ${k} ${d.id}`);return json(d);}}
 fail('Endpoint tidak ditemukan.',404);
 }
 if(req.method!=='GET')fail('Method tidak diizinkan.',405);const files={'/':'index.html','/app.js':'app.js','/mailketing.js':'mailketing.js','/import-tools.js':'import-tools.js','/crm-ui.js':'crm-ui.js','/style.css':'style.css','/email-design.js':'email-design.js','/email-builder.js':'email-builder.js','/workspace-ui.js':'workspace-ui.js'},file=files[path];if(!file)fail('Halaman tidak ditemukan.',404);res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https:; frame-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'");res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(readFileSync(root+file));
 }catch(e){json({error:(e.status||e.userHttp)?e.message:'Terjadi kesalahan server. Periksa log aplikasi di Coolify.'},e.status||e.userHttp||500);if(!e.status)console.error(e.message);}});
server.listen(port,'0.0.0.0',()=>console.log(`MailK CRM listening on ${port}`));
process.on('SIGTERM',()=>{stopping=true;clearInterval(interval);clearInterval(inboxInterval);server.close(()=>{db.close();process.exit(0);});});
