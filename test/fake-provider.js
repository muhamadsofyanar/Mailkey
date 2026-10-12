import {writeFileSync} from 'node:fs';
const actual=globalThis.fetch;
globalThis.fetch=async(url,opt)=>{
 if(String(url)==='https://api.mailketing.co.id/api/v2/send'){const b=JSON.parse(opt.body);writeFileSync(process.env.TEST_CAPTURE,JSON.stringify(b));return new Response(JSON.stringify({success:true,data:{message_id:`<${b.message_id}>`}}),{status:200,headers:{'Content-Type':'application/json'}});}
 if(String(url).startsWith('https://api.mailketing.co.id/api/v2/')){
 const endpoint=String(url).split('/').pop();let data;
 if(endpoint==='lists')data={lists:[{list_id:93653,list_name:'Ruang 1'}]};
 if(endpoint==='senders')data={senders:[{sender_email:'sofyan@izinhukum.com'}]};
 if(endpoint==='credits')data={credits:321};
 if(endpoint==='subscribers'){
 const payload=JSON.parse(opt.body);if(payload.email==='bad-request@example.com')return new Response(JSON.stringify({success:false,message:'Validation failed'}),{status:422});
 data={status:'added',list_id:payload.list_id};
 }
 if(data)return new Response(JSON.stringify({success:true,data}),{status:200});
 }
 return actual(url,opt);
};
