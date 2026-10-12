import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normaliseSenders,normaliseLists,eligibleContacts,subscriberPayload} from '../public/mailketing.js';
test('sender and list display support real account response and documented fields',()=>{
 assert.deepEqual(normaliseSenders({senders:[{sender_email:'sofyan@izinhukum.com'}]}),[{email:'sofyan@izinhukum.com'}]);
 assert.deepEqual(normaliseSenders({senders:[{email:'sender@example.com'}]}),[{email:'sender@example.com'}]);
 assert.deepEqual(normaliseLists({lists:[{list_id:93653,list_name:'Ruang 1'}]}),[{id:93653,name:'Ruang 1'}]);
 assert.deepEqual(normaliseLists({lists:[{list_id:'invalid',list_name:'Ignore'}]}),[]);
});
test('sync only includes active consenting contacts and protects provider routing fields',()=>{
 const contacts=[{id:'a',status:'active',consent:true},{id:'b',status:'pending',consent:true},{id:'c',status:'active',consent:false}];
 assert.deepEqual(eligibleContacts(contacts).map(c=>c.id),['a']);
 const payload=subscriberPayload({email:'actual@example.com',name:'Test User',phone:'08123',custom:{list_id:999,email:'override@example.com',first_name:'Wrong',city:'Bandung'}},93653);
 assert.equal(payload.list_id,93653);assert.equal(payload.email,'actual@example.com');assert.equal(payload.first_name,'Test');assert.equal(payload.last_name,'User');assert.equal(payload.city,'Bandung');
});
