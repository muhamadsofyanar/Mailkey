import {test} from 'node:test';
import assert from 'node:assert/strict';
import {report} from '../crm.mjs';
test('CRM report distinguishes paid revenue, repeat buyers, closed opportunity win rate, CSAT and historical customer value',()=>{
 const r=report({contacts:[{id:'a',name:'A'},{id:'b',name:'B'}],deals:[{stage:'won',value:10,closed_at:150},{stage:'lost',value:20,closed_at:180},{stage:'proposal',value:300}],orders:[{contact:'a',amount:100,status:'paid',paid_at:50},{contact:'a',amount:200,status:'paid',paid_at:120},{contact:'a',amount:300,status:'paid',paid_at:170},{contact:'b',amount:900,status:'unpaid',paid_at:160},{contact:'b',amount:500,status:'refunded',paid_at:160}],tasks:[{status:'open',due:100},{status:'done',due:50}],tickets:[{status:'resolved',resolved_at:170,csat:4},{status:'open'}]},100,200,200);
 assert.equal(r.revenue,500);assert.equal(r.buyers,1);assert.equal(r.returning,1);assert.equal(r.repeat_rate,100);assert.equal(r.win_rate,50);assert.equal(r.pipeline,300);assert.equal(r.overdue,1);assert.equal(r.open_tickets,1);assert.equal(r.csat,4);assert.equal(r.customers[0].monetary,600);
 const empty=report({contacts:[],deals:[],orders:[],tasks:[],tickets:[]},100,200,200);assert.equal(empty.win_rate,null);assert.equal(empty.repeat_rate,null);assert.equal(empty.csat,null);
});
