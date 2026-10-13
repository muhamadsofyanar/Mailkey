import {createCipheriv,createDecipheriv,createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';

// SESSION_SECRET is the deployment root key. Changing it requires re-entering secrets.
export function createSettingsStore(db,env){
 const key=createHash('sha256').update('mailk-settings-v1\0'+env.SESSION_SECRET).digest();
 const read=k=>db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value;
 const write=(k,v)=>db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(k,v);
 const encrypt=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:data.toString('hex')});};
 const decrypt=value=>{const d=JSON.parse(value),cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(d.iv,'hex'));cipher.setAuthTag(Buffer.from(d.tag,'hex'));return Buffer.concat([cipher.update(Buffer.from(d.data,'hex')),cipher.final()]).toString('utf8');};
 const names={mailketing_token:'MAILKETING_API_TOKEN',crm_token:'CRM_API_TOKEN',mcp_token:'MCP_API_TOKEN',webhook_secret:'WEBHOOK_SECRET'};
 // Import once, including empty values, so revocation cannot restore an env token.
 for(const [name,source] of Object.entries(names))if(read('secret.'+name)===undefined)write('secret.'+name,encrypt(env[source]||''));
 const secret=name=>decrypt(read('secret.'+name));
 const setSecret=(name,value)=>{if(!(name in names))throw Error('Unknown secret');write('secret.'+name,encrypt(value));};
 const setPassword=value=>{const salt=randomBytes(16).toString('hex');write('admin_password',JSON.stringify({salt,hash:scryptSync(value,salt,64).toString('hex')}));};
 if(read('admin_password')===undefined){if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)throw Error('Set ADMIN_PASSWORD (12+ karakter) untuk instalasi awal.');setPassword(env.ADMIN_PASSWORD);}
 if(read('admin_email')===undefined)write('admin_email',env.ADMIN_EMAIL||'admin@example.com');
 const verifyPassword=value=>{if(typeof value!=='string'||value.length>1024)return false;const d=JSON.parse(read('admin_password'));return timingSafeEqual(scryptSync(value,d.salt,64),Buffer.from(d.hash,'hex'));};
 return {secret,setSecret,setPassword,verifyPassword,email:()=>read('admin_email'),setEmail:value=>write('admin_email',value),status:()=>Object.fromEntries(Object.keys(names).map(name=>[name,{configured:!!secret(name)}]))};
}
