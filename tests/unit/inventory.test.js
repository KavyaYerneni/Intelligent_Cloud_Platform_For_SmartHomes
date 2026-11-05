import test from 'node:test';
import assert from 'node:assert/strict';
import {validTime} from '../../backend/domain.js';
import {inScope,passwordHash,passwordMatches} from '../../backend/security.js';
test('Siddharth: heartbeat age and future skew',()=>{const now=Date.now();assert.equal(validTime(new Date(now).toISOString(),now),now);assert.throws(()=>validTime(new Date(now-86400001).toISOString(),now));assert.throws(()=>validTime(new Date(now+60001).toISOString(),now));});
test('Shared: tenant and house scope cannot be overridden',()=>{const a={tenant_id:'T1',house_ids:['H1']};assert.equal(inScope(a,{tenant_id:'T1',id:'H1'}),true);assert.equal(inScope(a,{tenant_id:'T2',id:'H1'}),false);assert.equal(inScope(a,{tenant_id:'T1',house_id:'H2'}),false);const hash=passwordHash('demonstration');assert(passwordMatches('demonstration',hash));assert(!passwordMatches('wrong',hash));});
