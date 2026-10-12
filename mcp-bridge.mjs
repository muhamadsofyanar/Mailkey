// Claude Desktop stdio bridge. Requires Node 24; no extra dependencies.
import {createInterface} from 'node:readline';
const url=process.env.MAILK_MCP_URL,token=process.env.MCP_API_TOKEN;
if(!url||!token){console.error('Set MAILK_MCP_URL and MCP_API_TOKEN.');process.exit(1);}
const endpoint=new URL(url);if(endpoint.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)){console.error('Remote MCP requires HTTPS.');process.exit(1);}
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){if(!line.trim())continue;let message;try{message=JSON.parse(line);const r=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify(message),signal:AbortSignal.timeout(30000)});if(r.status===202)continue;const data=await r.json();if(!r.ok)throw Error(data.error||'MCP HTTP '+r.status);process.stdout.write(JSON.stringify(data)+'\n');}catch(e){if(message?.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32603,message:e.message}})+'\n');else console.error('MCP bridge request failed.');}}
