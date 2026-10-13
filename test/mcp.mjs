import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
const dir=mkdtempSync(tmpdir()+'/mailk-mcp-'),base='http://localhost:39179',token='test-mcp-token-'.repeat(3);let child;
before(async()=>{child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'39179',APP_URL:base,DATA_DIR:dir,ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'a-test-password-strong',SESSION_SECRET:'a'.repeat(40),MCP_API_TOKEN:token,WORKER_INTERVAL_MS:'999999'}});await new Promise((resolve,reject)=>{let output='';child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>reject(Error(output)),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>reject(Error(output)));});});
after(()=>{child?.kill();rmSync(dir,{recursive:true,force:true});});
async function rpc(method,params={},auth=token){const r=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return {status:r.status,data:await r.json()};}
async function call(name,args={}){return (await rpc('tools/call',{name,arguments:args})).data;}
test('MCP requires dedicated token and exposes CRM tools without launch or delete',async()=>{
 assert.equal((await rpc('initialize',{protocolVersion:'2025-11-25'},'wrong')).status,401);
 const init=await rpc('initialize',{protocolVersion:'2025-11-25'});assert.equal(init.status,200);assert.equal(init.data.result.serverInfo.version,'0.6.4');
 const tools=(await rpc('tools/list')).data.result.tools;assert.ok(tools.some(t=>t.name==='search_contacts'));assert.ok(!tools.some(t=>/launch|delete|restore/.test(t.name)));
 const created=await call('upsert_contact',{email:'mcp@example.com',name:'MCP',company:'Acme',custom:{region:'Jakarta'}});assert.ok(!created.result.isError);const c=JSON.parse(created.result.content[0].text);assert.equal(c.status,'pending');
 const found=await call('search_contacts',{query:'Acme'});assert.equal(JSON.parse(found.result.content[0].text).contacts[0].id,c.id);
 const note=await call('add_note',{contact:c.id,name:'Call',content:'Customer asked for details'});assert.ok(!note.result.isError);
 const history=await call('contact_history',{id:c.id});assert.equal(JSON.parse(history.result.content[0].text).crm.notes.length,1);
 assert.equal((await call('upsert_contact',{email:c.email,status:'active',consent:true})).result.isError,true);
 assert.equal((await call('search_contacts',{limit:-1})).result.isError,true);
 assert.equal((await call('launch_campaign',{})).error.code,-32602);
 const tag=JSON.parse((await call('create_tag',{name:'MCP Leads'})).result.content[0].text);
 assert.ok(!(await call('tag_contact',{email:c.email,tag:tag.id})).result.isError);
 const field=await call('create_custom_field',{name:'Region',key:'region',type:'text'});assert.ok(!field.result.isError);
 assert.ok(!(await call('create_task',{contact:c.id,name:'Follow up',due:Date.now()+86400000})).result.isError);
 const catalog=JSON.parse((await call('crm_catalog')).result.content[0].text);assert.ok(catalog.fields.some(f=>f.key==='region'));
 const summary=JSON.parse((await call('crm_report')).result.content[0].text);assert.equal(summary.crm.orders,0);assert.equal(summary.email.queued,0);
 assert.equal(JSON.parse((await call('preview_audience',{})).result.content[0].text).count,0);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',password:'a-test-password-strong'})});
 const cookie=login.headers.get('set-cookie').split(';')[0];const templateResponse=await fetch(base+'/api/records/templates',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'Welcome',html:'<p>Hello</p>'})});const template=await templateResponse.json();
 const draft=JSON.parse((await call('create_campaign_draft',{name:'MCP Draft',subject:'Welcome',template:template.id})).result.content[0].text);assert.equal(draft.status,'draft');
 const state=await fetch(base+'/api/state',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(state.jobs.length,0);
 const bridge=spawn(process.execPath,['mcp-bridge.mjs'],{env:{...process.env,MAILK_MCP_URL:base+'/mcp',MCP_API_TOKEN:token}});
 try{const reply=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('bridge timeout')),5000);bridge.stdout.once('data',b=>{clearTimeout(timer);resolve(JSON.parse(b.toString().trim()));});});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id:9,method:'initialize',params:{protocolVersion:'2025-11-25'}})+'\n');assert.equal((await reply).result.serverInfo.version,'0.6.4');}finally{bridge.kill();}
 const denied=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://attacker.example','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(denied.status,403);
 const api=await fetch(base+'/api/state',{headers:{Authorization:'Bearer '+token}});assert.equal(api.status,401);
 const invalid=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{'});assert.equal(invalid.status,400);
});
