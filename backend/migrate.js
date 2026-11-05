import {readFile,readdir} from 'node:fs/promises';
import {pool,tx,indexes,close} from './db.js';
await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
for(const name of (await readdir(new URL('./migrations/',import.meta.url))).sort()){
 if((await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount)continue;
 await tx(async c=>{await c.query(await readFile(new URL(`./migrations/${name}`,import.meta.url),'utf8'));await c.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);});
 console.log('Applied',name);
}
await indexes();await close();
