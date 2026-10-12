import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
const source=resolve(process.env.DATA_DIR||'./data','crm.sqlite');
const target=resolve(process.argv[2]||`./crm-backup-${new Date().toISOString().slice(0,10)}.sqlite`);
if(source===target)throw Error('Tujuan backup harus berbeda dari database utama.');
const db=new DatabaseSync(source);db.prepare('VACUUM INTO ?').run(target);db.close();console.log(target);
