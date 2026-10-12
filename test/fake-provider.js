import {writeFileSync} from 'node:fs';
const actual=globalThis.fetch;
globalThis.fetch=async(url,opt)=>{
 if(String(url).startsWith('https://api.mailketing.co.id/api/v2/send')){const b=JSON.parse(opt.body);writeFileSync(process.env.TEST_CAPTURE,JSON.stringify(b));return new Response(JSON.stringify({success:true,data:{message_id:`<${b.message_id}>`}}),{status:200,headers:{'Content-Type':'application/json'}});}
 return actual(url,opt);
};
