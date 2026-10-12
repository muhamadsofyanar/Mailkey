import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHmac} from 'node:crypto';
test('worker sends personalized tracked email; repeat opens deduplicated; unsubscribe cancels subsequent mail',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mailk-worker-')),base='http://localhost:39178',secret='b'.repeat(40);let child,cookie;
 const req=async(p,b,method)=>{const r=await fetch(base+p,{method:method||(b?'POST':'GET'),headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:b?JSON.stringify(b):undefined});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
 try{
 child=spawn(process.execPath,['--import',resolve('test/fake-provider.js'),'server.mjs'],{env:{...process.env,PORT:'39178',APP_URL:base,DATA_DIR:dir,ADMIN_EMAIL:'test@example.com',ADMIN_PASSWORD:'worker-test-password',SESSION_SECRET:secret,MAILKETING_API_TOKEN:'test-only',WEBHOOK_SECRET:'worker-webhook-secret',WORKER_INTERVAL_MS:'30',TEST_CAPTURE:join(dir,'payload.json')}});
 await new Promise((ok,no)=>{const t=setTimeout(()=>no(Error('start timeout')),5000);child.stdout.once('data',()=>{clearTimeout(t);ok();});});
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:'test@example.com',password:'worker-test-password'})});cookie=login.headers.get('set-cookie').split(';')[0];
 await req('/api/settings',{enabled:false,from_email:'sender@example.com',from_name:'Business',address:'Jakarta'});
 const t=await req('/api/records/templates',{name:'Welcome',html:'<h1>Hello {{name}}</h1><a href="https://example.com/promo">Promo</a>'});
 const tag=await req('/api/records/tags',{name:'Signup',color:'#2563eb'});
 await req('/api/records/responders',{name:'Onboarding',tag:tag.id,active:true,steps:[{delay:0,template:t.id,subject:'Welcome {{name}}'},{delay:10,template:t.id,subject:'Follow-up'}]});
 const c=await req('/api/records/contacts',{name:'A & B',email:'person@example.com',tags:[tag.id],consent:true});
 await req('/api/records/templates/'+t.id,{name:'Welcome edited',html:'<h1>CHANGED AFTER QUEUE</h1>'},'PUT');
 await req('/api/settings',{enabled:true});
 let state;for(let i=0;i<50;i++){state=await req('/api/state');if(state.jobs.some(j=>j.status==='accepted'))break;await new Promise(r=>setTimeout(r,30));}
 const j=state.jobs.find(j=>j.status==='accepted');assert.ok(j);const payload=JSON.parse(readFileSync(join(dir,'payload.json'),'utf8'));assert.equal(payload.subject,'Welcome A & B');assert.match(payload.content,/Hello A &amp; B/);assert.match(payload.content,/\/click\//);assert.match(payload.content,/Berhenti berlangganan/);
 const sig=createHmac('sha256',secret).update(j.id).digest('base64url');await fetch(`${base}/open/${j.id}.${sig}`);await fetch(`${base}/open/${j.id}.${sig}`);state=await req('/api/state');assert.equal(state.metrics.opened,1);assert.equal(state.events.filter(e=>e.type==='opened').length,1);
 await req('/webhook/worker-webhook-secret',{type:'emailopen',email:c.email,message_id:j.message_id.replace(/^<|>$/g,''),date:'2026-10-12 01:00:00'});
 state=await req('/api/state');assert.equal(state.events.filter(e=>e.type==='opened'&&e.job===j.id).length,1);
 const history=await req('/api/contact-history?id='+c.id);assert.ok(history.jobs.some(x=>x.id===j.id));
 assert.ok(!JSON.parse(state.jobs.find(x=>x.id===j.id).payload).html);
 await req('/webhook/worker-webhook-secret',{type:'emailclick',email:c.email,link_clicked:'https://example.com/another',date:'2026-10-12 01:01:00'});
 state=await req('/api/state');assert.equal(state.events.find(e=>e.type==='clicked').job,'');

 const url=payload.content.match(/href="([^"]+unsubscribe[^"]+)"/)[1];const page=await fetch(url);assert.equal(page.status,200);state=await req('/api/state');assert.equal(state.contacts.find(x=>x.id===c.id).status,'active');
 await fetch(url,{method:'POST'});state=await req('/api/state');assert.equal(state.contacts.find(x=>x.id===c.id).status,'unsubscribed');assert.equal(state.jobs.filter(j=>j.status==='queued').length,0);
 // Bounce with the alternate message-ID format must resolve to the same job.
 await req('/webhook/worker-webhook-secret',{type:'bounce',email:c.email,message_id:j.message_id.replace(/^<|>$/g,''),reason:'User unknown',date:'2026-10-12 01:02:00'});
 state=await req('/api/state');assert.equal(state.events.find(e=>e.type==='bounced').job,j.id);
 // A large paused backlog must not starve unrelated mail jobs.
 await req('/api/settings',{enabled:false});
 const backlogTag=await req('/api/records/tags',{name:'Paused backlog',color:'#2563eb'});
 const responder=await req('/api/records/responders',{name:'Paused',tag:backlogTag.id,active:true,steps:Array.from({length:30},()=>({delay:0,template:t.id,subject:'Paused email'}))});
 for(let n=0;n<4;n++)await req('/api/records/contacts',{name:'Backlog '+n,email:`backlog${n}@example.com`,consent:true,tags:[backlogTag.id]});
 await req('/api/records/responders/'+responder.id,{...responder,active:false},'PUT');
 const testjob=await req('/api/queue-test',{template:t.id,subject:'Unblocked',email:'unblocked@example.com'});
 await req('/api/settings',{enabled:true});
 for(let i=0;i<50;i++){state=await req('/api/state');if(state.jobs.find(j=>j.id===testjob.id)?.status==='accepted')break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(state.jobs.find(j=>j.id===testjob.id).status,'accepted');assert.equal(state.jobs.filter(j=>j.owner===responder.id&&j.status==='queued').length,120);


 }finally{child?.kill();rmSync(dir,{recursive:true,force:true});}
});
