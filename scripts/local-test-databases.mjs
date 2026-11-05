// Optional Windows fallback for a broken Docker engine. These are real database
// processes, not in-memory repository mocks. Install helpers in .runtime/db-tools.
import EmbeddedPostgres from '../.runtime/db-tools/node_modules/embedded-postgres/dist/index.js';
import {MongoMemoryServer} from '../.runtime/db-tools/node_modules/mongodb-memory-server/index.js';
import {mkdir,access} from 'node:fs/promises';
import path from 'node:path';
try{process.loadEnvFile('.env');}catch{}
const root=path.resolve('.runtime');
const dbDir=path.join(root,'postgres-data');
const mongoDir=path.join(root,'mongo-data');
await mkdir(mongoDir,{recursive:true});
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Fallback is local-only.');
const pg=new EmbeddedPostgres({databaseDir:dbDir,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),port:Number(url.port||5432),persistent:true,postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
try{await access(path.join(dbDir,'PG_VERSION'));}catch{await pg.initialise();}
await pg.start();
const client=pg.getPgClient();await client.connect();
const dbname=url.pathname.slice(1);
if(!/^[a-zA-Z0-9_]+$/.test(dbname))throw Error('Use an alphanumeric local database name.');
if(!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[dbname])).rowCount)await pg.createDatabase(dbname);
await client.end();
const mongo=await MongoMemoryServer.create({binary:{downloadDir:path.join(root,'mongodb-binaries')},instance:{ip:'127.0.0.1',port:27017,dbPath:mongoDir,storageEngine:'wiredTiger'}});
console.log('Real PostgreSQL and MongoDB ready on localhost:5432 and localhost:27017. Data preserved under .runtime.');
let stopped=false;
async function stop(){if(stopped)return;stopped=true;await mongo.stop({doCleanup:false});await pg.stop();process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
setInterval(()=>{},60000);
