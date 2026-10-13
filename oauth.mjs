import {randomBytes,createHash} from 'node:crypto';
const random=()=>randomBytes(32).toString('base64url'),hash=v=>createHash('sha256').update(String(v)).digest('hex');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const callbacks=['https://claude.ai/api/mcp/auth_callback','https://claude.com/api/mcp/auth_callback'];
export function createOAuth({db,base,sessionKey,audit,staticTokenConfigured=()=>!!process.env.MCP_API_TOKEN}){
 db.exec(`CREATE TABLE IF NOT EXISTS oauth_clients(id TEXT PRIMARY KEY,data TEXT,created INTEGER);CREATE TABLE IF NOT EXISTS oauth_transactions(id TEXT PRIMARY KEY,data TEXT,expires INTEGER);CREATE TABLE IF NOT EXISTS oauth_codes(hash TEXT PRIMARY KEY,data TEXT,expires INTEGER);CREATE TABLE IF NOT EXISTS oauth_grants(id TEXT PRIMARY KEY,client TEXT,name TEXT,created INTEGER,revoked INTEGER DEFAULT 0);CREATE TABLE IF NOT EXISTS oauth_tokens(hash TEXT PRIMARY KEY,grant_id TEXT,kind TEXT,expires INTEGER,used INTEGER DEFAULT 0);`);
 const resource=base+'/mcp',enabled=()=>db.prepare("SELECT value FROM settings WHERE key='mcp_oauth_enabled'").get()?.value!=='false';
 const available=()=>enabled()&&(base.startsWith('https:')||['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
 const client=id=>{const r=db.prepare('SELECT data FROM oauth_clients WHERE id=?').get(id);return r&&JSON.parse(r.data);};
 const validToken=(token,kind)=>{if(!available()||typeof token!=='string'||token.length>512)return null;return db.prepare('SELECT t.*,g.client,g.name FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.hash=? AND t.kind=? AND t.used=0 AND t.expires>? AND g.revoked=0').get(hash(token),kind,Date.now());};
 const issue=grant=>{const access=random(),refresh=random(),now=Date.now();db.prepare('INSERT INTO oauth_tokens VALUES(?,?,?,?,0)').run(hash(access),grant,'access',now+3600000);db.prepare('INSERT INTO oauth_tokens VALUES(?,?,?,?,0)').run(hash(refresh),grant,'refresh',now+30*86400000);return {access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope:'mcp'};};
 const clean=()=>{const now=Date.now();for(const t of ['oauth_transactions','oauth_codes','oauth_tokens'])db.prepare(`DELETE FROM ${t} WHERE expires<?`).run(now-86400000);};
 const page=(res,title,body)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self' https://claude.ai https://claude.com; frame-ancestors 'none'; base-uri 'none'"});res.end(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><style>body{font:16px/1.6 Arial;background:#f4f6fa;color:#172b4d;margin:0}main{max-width:540px;margin:60px auto;background:white;padding:32px;border-radius:16px}label{display:block;margin:14px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #ccd6e8;border-radius:8px}button{margin:20px 8px 0 0;padding:12px 18px;border:0;border-radius:8px;cursor:pointer;background:#2563eb;color:white}small{color:#52657b}#error{color:#b42318}</style><main>${body}</main></html>`);};
 async function read(req){let b='';for await(const part of req){b+=part;if(Buffer.byteLength(b)>65536)throw Error('Request terlalu besar.');}if(String(req.headers['content-type']||'').startsWith('application/json'))return JSON.parse(b||'{}');return Object.fromEntries(new URLSearchParams(b));}
 const connections=()=>db.prepare('SELECT id,name,created FROM oauth_grants WHERE revoked=0 ORDER BY created DESC').all();
 async function settings(req,res,json){if(!sessionKey(req))return json({error:'Silakan login.'},401);if(req.method==='GET')return json({enabled:enabled(),available:available(),url:resource,connections:connections(),registration:'dynamic',static_token_configured:staticTokenConfigured()});if(req.method!=='POST')return json({error:'POST required.'},405);if(req.headers.origin!==base)return json({error:'Origin tidak valid.'},403);let b;try{b=await read(req);}catch{return json({error:'Request tidak valid.'},400);}if(b.enabled!==undefined){if(typeof b.enabled!=='boolean')return json({error:'enabled harus boolean.'},400);db.prepare("INSERT OR REPLACE INTO settings VALUES('mcp_oauth_enabled',?)").run(String(b.enabled));audit('MCP OAuth '+(b.enabled?'enabled':'disabled'));if(!b.enabled){db.prepare('UPDATE oauth_grants SET revoked=1').run();db.prepare('DELETE FROM oauth_codes').run();db.prepare('DELETE FROM oauth_transactions').run();}}if(b.revoke){db.prepare('UPDATE oauth_grants SET revoked=1 WHERE id=?').run(String(b.revoke));audit('MCP OAuth connection revoked');}return json({ok:true});}
 async function route(req,res,u,json){
 const path=u.pathname;if(!path.startsWith('/oauth/')&&!path.startsWith('/.well-known/'))return false;
 const send=(data,status=200)=>{json(data,status);return true;};
 if(path.startsWith('/.well-known/')){
 if(req.method!=='GET')return send({error:'method_not_allowed'},405);
 if(['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(path))return send({resource,resource_name:'MailK CRM',authorization_servers:[base],scopes_supported:['mcp'],bearer_methods_supported:['header']});
 if(path==='/.well-known/oauth-authorization-server')return send({issuer:base,authorization_endpoint:base+'/oauth/authorize',token_endpoint:base+'/oauth/token',registration_endpoint:base+'/oauth/register',revocation_endpoint:base+'/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:['mcp'],client_id_metadata_document_supported:false});
 return send({error:'not_found'},404);
 }
 if(!available())return send({error:'temporarily_unavailable',error_description:'OAuth nonaktif atau APP_URL belum HTTPS.'},503);
 clean();
 const error=(name,message,status=400)=>send({error:name,error_description:message},status);
 if(['/oauth/register','/oauth/token','/oauth/revoke'].includes(path)){
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return true;}
 if(req.method!=='POST')return error('invalid_request','POST required.',405);
 let b;try{b=await read(req);}catch{return error('invalid_request','Payload tidak valid.');}
 if(!b||typeof b!=='object'||Array.isArray(b))return error('invalid_request','Object required.');
 if(path==='/oauth/register'){
 if(!Array.isArray(b.redirect_uris)||!b.redirect_uris.length||b.redirect_uris.length>4||b.redirect_uris.some(v=>!callbacks.includes(v)))return error('invalid_redirect_uri','Callback yang didukung: Claude ai/com auth_callback.');
 if(b.token_endpoint_auth_method&&b.token_endpoint_auth_method!=='none')return error('invalid_client_metadata','Gunakan public client dengan PKCE.');
 if(b.grant_types&&(!Array.isArray(b.grant_types)||b.grant_types.some(g=>!['authorization_code','refresh_token'].includes(g))))return error('invalid_client_metadata','Grant tidak didukung.');
 if(db.prepare('SELECT COUNT(*) n FROM oauth_clients').get().n>=1000)return error('temporarily_unavailable','Batas registrasi tercapai.',429);
 const c={client_id:random(),client_id_issued_at:Math.floor(Date.now()/1000),client_name:String(b.client_name||'Claude').slice(0,100),redirect_uris:[...new Set(b.redirect_uris)],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']};db.prepare('INSERT INTO oauth_clients VALUES(?,?,?)').run(c.client_id,JSON.stringify(c),Date.now());return send(c,201);
 }
 const c=client(b.client_id);if(!c)return error('invalid_client','Client tidak dikenal.');
 if(b.resource&&b.resource!==resource)return error('invalid_target','Resource tidak sesuai.');
 if(b.scope&&b.scope!=='mcp')return error('invalid_scope','Scope tidak sesuai.');
 if(path==='/oauth/revoke'){const t=db.prepare('SELECT grant_id FROM oauth_tokens WHERE hash=?').get(hash(b.token||''));if(t)db.prepare('UPDATE oauth_grants SET revoked=1 WHERE id=? AND client=?').run(t.grant_id,c.client_id);return send({});}
 if(b.grant_type==='authorization_code'){
 const row=db.prepare('SELECT data,expires FROM oauth_codes WHERE hash=?').get(hash(b.code||''));if(!row||row.expires<Date.now())return error('invalid_grant','Kode tidak valid atau kedaluwarsa.');const data=JSON.parse(row.data);
 if(data.client!==c.client_id||data.redirect!==b.redirect_uri||typeof b.code_verifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier)||createHash('sha256').update(b.code_verifier).digest('base64url')!==data.challenge)return error('invalid_grant','PKCE atau client tidak sesuai.');
 db.exec('BEGIN');try{db.prepare('DELETE FROM oauth_codes WHERE hash=?').run(hash(b.code));const grant=random();db.prepare('INSERT INTO oauth_grants VALUES(?,?,?,?,0)').run(grant,c.client_id,c.client_name,Date.now());const tokens=issue(grant);audit('MCP OAuth access approved');db.exec('COMMIT');return send(tokens);}catch(e){db.exec('ROLLBACK');throw e;}
 }
 if(b.grant_type==='refresh_token'){
 const row=validToken(b.refresh_token,'refresh');if(!row||row.client!==c.client_id){const old=db.prepare("SELECT t.grant_id,g.client FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id WHERE t.hash=? AND t.kind='refresh' AND t.used=1").get(hash(b.refresh_token||''));if(old?.client===c.client_id)db.prepare('UPDATE oauth_grants SET revoked=1 WHERE id=?').run(old.grant_id);return error('invalid_grant','Refresh token tidak valid.');}
 db.exec('BEGIN');try{db.prepare('UPDATE oauth_tokens SET used=1 WHERE grant_id=?').run(row.grant_id);const tokens=issue(row.grant_id);db.exec('COMMIT');return send(tokens);}catch(e){db.exec('ROLLBACK');throw e;}
 }
 return error('unsupported_grant_type','Gunakan authorization_code atau refresh_token.');
 }
 if(path==='/oauth/authorize'){
 if(req.method==='GET'){
 const a=Object.fromEntries(u.searchParams),c=client(a.client_id);if(!c||!c.redirect_uris.includes(a.redirect_uri))return error('invalid_request','Client/callback tidak sesuai.');
 if(a.response_type!=='code'||a.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(a.code_challenge||''))return error('invalid_request','Authorization code dan PKCE S256 wajib.');
 if(a.resource&&a.resource!==resource)return error('invalid_target','Resource tidak sesuai.');if(a.scope&&a.scope!=='mcp')return error('invalid_scope','Scope tidak didukung.');
 if((a.state||'').length>2048)return error('invalid_request','State terlalu panjang.');
 const owner=sessionKey(req);if(!owner){page(res,'Masuk ke MailK',`<h1>Masuk ke MailK</h1><p>Masuk untuk menghubungkan Claude dengan CRM Anda.</p><form id="login"><label>Email admin</label><input name="email" type="email" required autocomplete="username"><label>Password</label><input name="password" type="password" required autocomplete="current-password"><button>Masuk</button><p id="error"></p></form><script>document.querySelector('#login').onsubmit=async event=>{event.preventDefault();const f=event.target,b=f.querySelector('button');b.disabled=true;try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value,password:f.password.value})});const d=await r.json();if(!r.ok)throw Error(d.error);location.reload();}catch(e){document.querySelector('#error').textContent=e.message;b.disabled=false;}};</script>`);return true;}
 if(db.prepare('SELECT COUNT(*) n FROM oauth_transactions WHERE expires>?').get(Date.now()).n>=1000)return error('temporarily_unavailable','Coba beberapa menit lagi.',429);
 const transaction=random(),csrf=random(),data={client:c.client_id,redirect:a.redirect_uri,state:a.state||'',challenge:a.code_challenge,owner,csrf:hash(csrf)};db.prepare('INSERT INTO oauth_transactions VALUES(?,?,?)').run(transaction,JSON.stringify(data),Date.now()+600000);
 page(res,'Izinkan akses Claude',`<h1>Hubungkan ${esc(c.client_name)}</h1><p>Aplikasi ini meminta akses ke workspace MailK CRM Anda.</p><ul><li>Membaca kontak, riwayat dan laporan.</li><li>Mengelola kontak, tag, field, catatan dan tugas.</li><li>Membuat draft campaign untuk ditinjau.</li></ul><p>Pengiriman campaign dan pemulihan persetujuan tetap dilakukan di MailK.</p><small>Tujuan callback: ${esc(data.redirect)}</small><form method="POST" action="/oauth/authorize"><input type="hidden" name="transaction" value="${transaction}"><input type="hidden" name="csrf" value="${csrf}"><button name="decision" value="approve">Izinkan akses</button><button name="decision" value="deny">Batalkan</button></form>`);return true;
 }
 if(req.method==='POST'){
 // Explicit foreign origins are rejected. Opaque/missing origins must still pass session-bound CSRF below.
 const requestOrigin=req.headers.origin,validOrigin=!requestOrigin||requestOrigin==='null'||requestOrigin===base;if(!validOrigin)return error('access_denied','Origin tidak sesuai APP_URL. Mulai ulang koneksi dari domain CRM yang benar.',403);if(!sessionKey(req))return error('access_denied','Sesi login berakhir atau cookie tidak terkirim. Mulai ulang koneksi dari Claude dan login kembali.',401);let b;try{b=await read(req);}catch{return error('invalid_request','Payload tidak valid.');}
 const row=db.prepare('SELECT data,expires FROM oauth_transactions WHERE id=?').get(String(b.transaction||''));if(!row||row.expires<Date.now())return error('invalid_request','Persetujuan kedaluwarsa.');const data=JSON.parse(row.data);
 if(data.owner!==sessionKey(req)||data.csrf!==hash(b.csrf||''))return error('access_denied','CSRF tidak valid.',403);
 if(!['approve','deny'].includes(b.decision))return error('invalid_request','Keputusan tidak valid.');
 db.prepare('DELETE FROM oauth_transactions WHERE id=?').run(b.transaction);const redirect=new URL(data.redirect);if(data.state)redirect.searchParams.set('state',data.state);
 if(b.decision==='deny')redirect.searchParams.set('error','access_denied');else{const code=random();db.prepare('INSERT INTO oauth_codes VALUES(?,?,?)').run(hash(code),JSON.stringify(data),Date.now()+300000);redirect.searchParams.set('code',code);}
 res.writeHead(303,{Location:redirect.toString()});res.end();return true;
 }
 return error('invalid_request','GET/POST required.',405);
 }
 return error('invalid_request','Endpoint tidak ditemukan.',404);
 }
 return {route,settings,available,enabled,authenticate:token=>!!validToken(token,'access'),resource};
}
