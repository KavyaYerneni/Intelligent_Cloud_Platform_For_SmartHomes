// The alert UI's note hints must match the server's transition guards.
import {expect,test} from 'vitest';
import {checkTransition,transitions} from '../../backend/domain.js';
import {noteRequirement,reached,STEPS} from '../../frontend/views/alerts/lifecycle.js';

test('a note is required exactly when the server requires one',()=>{
  const actor={role:'operator'};
  for(const [from,targets] of Object.entries(transitions))for(const target of targets)for(const severity of ['CRITICAL','HIGH','MEDIUM'])for(const assigned of [null,'u1']){
    const alert={state:from,version:1,severity,assigned_to:assigned,assignedTo:assigned};
    let serverNeedsNote=false;
    try{checkTransition(alert,target,actor,'',1);}catch(e){if(e.code==='NOTE_REQUIRED')serverNeedsNote=true;else throw e;}
    expect(Boolean(noteRequirement(target,alert)),`${from} to ${target}, ${severity}, assigned=${!!assigned}`).toBe(serverNeedsNote);
  }
});

test('reached states come from the audit history',()=>{
  const a={state:'INVESTIGATING',history:[{detail:{toState:'ACKNOWLEDGED'}},{detail:{toState:'INVESTIGATING'}}]};
  expect([...reached(a)]).toEqual(['ACTIVE','ACKNOWLEDGED','INVESTIGATING']);
  expect(STEPS).toEqual(['ACTIVE','ACKNOWLEDGED','INVESTIGATING','RESOLVED']);
});
