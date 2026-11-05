import pg from 'pg';
import {MongoClient} from 'mongodb';
export const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
export const mongo = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:27017',{serverSelectionTimeoutMS:2000});
export const docs = mongo.db(process.env.MONGO_DB || 'smarthome');
export async function tx(fn){ const c=await pool.connect(); try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();} }
export async function indexes(){
  await docs.collection('telemetry_events').createIndex({tenantId:1,eventId:1},{unique:true});
  await docs.collection('telemetry_events').createIndex({tenantId:1,houseId:1,deviceId:1,occurredAt:-1});
  await docs.collection('telemetry_events').createIndex({expiresAt:1},{expireAfterSeconds:0});
  await docs.collection('ai_results').createIndex({tenantId:1,eventId:1},{unique:true});
  await docs.collection('device_status').createIndex({tenantId:1,deviceId:1,timestamp:-1});
  await docs.collection('device_status').createIndex({expiresAt:1},{expireAfterSeconds:0});
}
export async function close(){await pool.end();await mongo.close();}
export const rows=async(sql,args=[]) => (await pool.query(sql,args)).rows;
export function dto(row){if(!row)return row; return Object.fromEntries(Object.entries(row).filter(([k])=>!['password_hash','credential_hash','fingerprint','envelope','idempotency_key'].includes(k)).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]));}
