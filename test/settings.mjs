import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

test('settings migrate, encrypt, revoke, persist and protect account changes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mailk-settings-'));let child,cookie='',base;
 const original='legacy-mailketing-secret',crm='c'.repeat(40),mcp='m'.repeat(40);
 const start=async(password='initial-password-strong')=>{child=spawn(process.execPath,['--import','./test/fake-provider.js','server.mjs'],{env:{...process.env,PORT:'39181',APP_URL:'http://localhost:39181',DATA_DIR:dir,SESSION_SECRET:'s'.repeat(40),ADMIN_EMAIL:'admin@example.com',ADMIN_PASSWORD:password,MAILKETING_API_TOKEN:original,CRM_API_TOKEN:crm,MCP_API_TOKEN:mcp,WORKER_INTERVAL_MS:'999999'}});base='http://localhost:39181';await new Promise((resolve,reject)=>{let error='';const timeout=setTimeout(()=>reject(Error(error||'start timeout')),5000);child.stderr.on('data',b=>error+=b);child.stdout.once('data',()=>{clearTimeout(timeout);resolve();});child.once('exit',()=>{clearTimeout(timeout);reject(Error(error));});});};
 const stop=async()=>{const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;};
 const request=async(path,data,extra={})=>{const r=await fetch(base+path,{method:data?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,...extra},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json(),headers:r.headers};};
 const login=async(email,password)=>{const r=await request('/api/login',{email,password});if(r.status===200)cookie=r.headers.get('set-cookie').split(';')[0];return r;};
 try{
 await start();assert.equal((await request('/api/connection-settings')).status,401);
 assert.equal((await login('admin@example.com','initial-password-strong')).status,200);
 const status=await request('/api/connection-settings');assert.equal(status.data.secrets.mailketing_token.configured,true);assert.ok(!JSON.stringify(status).includes(original));
 assert.equal((await request('/api/connection-settings',undefined,{Cookie:'',Authorization:'Bearer '+crm})).status,403);
 assert.equal((await request('/api/connection-settings',{current_password:'wrong',secrets:{mailketing_token:'replacement'}})).status,403);
 assert.equal((await request('/api/connection-settings',{current_password:'initial-password-strong',secrets:{crm_token:'short'}})).status,400);
 assert.equal((await request('/api/connection-settings',{current_password:'initial-password-strong',secrets:{}},{Origin:'https://evil.example'})).status,403);
 await request('/api/settings',{enabled:true});
 assert.equal((await request('/api/connection-settings',{current_password:'initial-password-strong',secrets:{mailketing_token:'replacement-secret',crm_token:'',mcp_token:''}})).status,200);
 assert.equal((await request('/api/state')).data.config.enabled,false);
 assert.equal((await request('/api/provider/credits')).status,200);
 assert.equal((await request('/api/contact?email=test@example.com',undefined,{Cookie:'',Authorization:'Bearer '+crm})).status,401);
 const m=await request('/mcp',{jsonrpc:'2.0',id:1,method:'ping'},{Cookie:'',Authorization:'Bearer '+mcp});assert.equal(m.status,401);
 let db=new DatabaseSync(join(dir,'crm.sqlite'));const rows=db.prepare('SELECT * FROM settings').all();db.close();assert.ok(!JSON.stringify(rows).includes('replacement-secret'));assert.ok(!JSON.stringify(rows).includes(original));
 assert.equal((await request('/api/connection-settings',{current_password:'initial-password-strong',admin_email:'new@example.com',new_password:'updated-password-strong'})).data.relogin,true);
 assert.equal((await request('/api/state')).status,401);assert.equal((await login('admin@example.com','initial-password-strong')).status,401);assert.equal((await login('new@example.com','updated-password-strong')).status,200);
 await stop();cookie='';await start('');assert.equal((await login('new@example.com','updated-password-strong')).status,200);
 const persisted=await request('/api/connection-settings');assert.equal(persisted.data.secrets.crm_token.configured,false);assert.equal(persisted.data.secrets.mcp_token.configured,false);
 assert.equal((await request('/api/contact?email=test@example.com',undefined,{Cookie:'',Authorization:'Bearer '+crm})).status,401);
 assert.equal((await request('/api/connection-settings',{current_password:'updated-password-strong',secrets:{mailketing_token:''}})).status,200);
 assert.equal((await request('/api/state')).data.config.connected,false);
 }finally{if(child?.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true});}
});
