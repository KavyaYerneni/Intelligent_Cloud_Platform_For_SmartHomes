import test from 'node:test';
import assert from 'node:assert/strict';
import {classify,checkTransition,allowedActions} from '../../backend/domain.js';
test('Kavya: documented severity boundaries and deterministic smoke rule',()=>{
 assert.equal(classify({type:'smoke_alarm',confidence:0}).severity,'CRITICAL');
 for(const [type,confidence,severity] of [['human_help_sound',.849,null],['human_help_sound',.85,'HIGH'],['unusual_sound',.749,null],['unusual_sound',.75,'MEDIUM'],['unusual_sound',.9,'HIGH'],['normal_appliance_sound',1,null]])assert.equal(classify({type,confidence}).severity,severity);
});
test('Kavya: exact transitions, role permissions, notes and concurrency',()=>{
 const a={state:'ACTIVE',version:1,severity:'CRITICAL'};
 assert.throws(()=>checkTransition(a,'RESOLVED',{role:'operator'},'done',1),e=>e.code==='ILLEGAL_TRANSITION');
 assert.throws(()=>checkTransition(a,'ACKNOWLEDGED',{role:'operator'},'',2),e=>e.code==='STALE_VERSION');
 checkTransition(a,'ACKNOWLEDGED',{role:'owner'},'',1);
 assert.deepEqual(allowedActions(a,'technician'),[]);
 assert.throws(()=>checkTransition({...a,state:'ACKNOWLEDGED'},'INVESTIGATING',{role:'operator'},'',1));
 assert.throws(()=>checkTransition({...a,state:'INVESTIGATING'},'RESOLVED',{role:'operator'},' ',1));
 checkTransition({...a,state:'INVESTIGATING'},'RESOLVED',{role:'operator'},'Smoke test ended',1);
 assert.deepEqual(allowedActions({...a,state:'RESOLVED'},'operator'),[]);
});
