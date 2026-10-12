import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importPlan,suggestMapping} from '../public/import-tools.js';
test('swapped name/phone suggestions and duplicate conflict modes',()=>{
 assert.deepEqual(suggestMapping(['Nama Lengkap','No Telepon','Email address'],[['081234567890','Budi','b@example.com']]),['phone','name','email']);
 const rows=[{email:' A@Example.com ',name:'Budi',phone:'0812 3456 7890',source:'Workshop'},{email:'a@example.com',name:'Other'},{email:'invalid'}];
 const review=importPlan(rows,[],'review');assert.equal(review.summary.added,1);assert.equal(review.summary.skipped,1);assert.equal(review.errors.length,1);assert.equal(review.operations[0].data.phone,'+6281234567890');
 const old=[{email:'a@example.com',name:'Old',custom:{province:'Jabar'}}];
 assert.equal(importPlan(rows,old,'fill').operations[0].data.name,'Old');
 assert.equal(importPlan(rows,old,'overwrite').operations[0].data.name,'Budi');
 assert.equal(importPlan(rows,old,'skip').summary.skipped,2);
});
