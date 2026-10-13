// Offline recovery: stop the application/container before running this command.
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {copyFileSync,existsSync,renameSync,rmSync} from 'node:fs';
const source=resolve(process.argv[2]||'');const target=resolve(process.env.DATA_DIR||'./data','crm.sqlite');
if(!process.argv[2]||source===target||!existsSync(source))throw Error('Usage: DATA_DIR=./data node restore.mjs /path/backup.sqlite --stopped');
if(process.argv[3]!=='--stopped')throw Error('Hentikan aplikasi dahulu, lalu tambahkan --stopped untuk mengonfirmasi.');
const check=new DatabaseSync(source,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup tidak valid.');for(const name of ['records','settings','jobs','sessions'])if(!check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name))throw Error('Backup bukan database MailK.');}finally{check.close();}
const stage=target+'.restore';copyFileSync(source,stage);const db=new DatabaseSync(stage);try{db.exec('DELETE FROM sessions');if(db.prepare("SELECT name FROM sqlite_master WHERE name='oauth_grants'").get())db.exec('UPDATE oauth_grants SET revoked=1');}finally{db.close();}
if(existsSync(target)){const old=new DatabaseSync(target);try{old.prepare('VACUUM INTO ?').run(target+'.before-restore-'+Date.now());}finally{old.close();}}
rmSync(target+'-wal',{force:true});rmSync(target+'-shm',{force:true});renameSync(stage,target);console.log('Database dipulihkan. Jalankan dengan SESSION_SECRET yang sesuai backup; seluruh sesi telah dicabut.');
