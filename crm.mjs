export const stages=['new','qualified','proposal','negotiation','won','lost'];
export const lifecycles=['lead','prospect','customer','inactive'];
export function report({contacts,deals,orders,tasks,tickets},from,to,now=Date.now()){
 const within=t=>Number.isFinite(t)&&t>=from&&t<=to;
 const paid=orders.filter(o=>o.status==='paid'),period=paid.filter(o=>within(o.paid_at));
 const buyers=new Set(period.map(o=>o.contact));
 const returning=[...buyers].filter(id=>paid.some(o=>o.contact===id&&o.paid_at<from)).length;
 const repeat=[...buyers].filter(id=>period.filter(o=>o.contact===id).length>1).length;
 const closed=deals.filter(d=>['won','lost'].includes(d.stage)&&within(d.closed_at));
 const ratings=tickets.filter(t=>t.status==='resolved'&&within(t.resolved_at)&&t.csat).map(t=>t.csat);
 return {revenue:period.reduce((n,o)=>n+o.amount,0),orders:period.length,buyers:buyers.size,returning,repeat_rate:buyers.size?repeat/buyers.size*100:null,won:closed.filter(d=>d.stage==='won').length,win_rate:closed.length?closed.filter(d=>d.stage==='won').length/closed.length*100:null,pipeline:deals.filter(d=>!['won','lost'].includes(d.stage)).reduce((n,d)=>n+d.value,0),overdue:tasks.filter(t=>t.status==='open'&&t.due<now).length,open_tickets:tickets.filter(t=>t.status!=='resolved').length,csat:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null,csat_responses:ratings.length,
 customers:contacts.map(c=>{const purchases=paid.filter(o=>o.contact===c.id),last=purchases.length?Math.max(...purchases.map(o=>o.paid_at)):null;return {id:c.id,name:c.name,email:c.email,frequency:purchases.length,monetary:purchases.reduce((n,o)=>n+o.amount,0),last_purchase:last,recency_days:last?Math.max(0,Math.floor((now-last)/86400000)):null};}).sort((a,b)=>b.monetary-a.monetary)};
}
