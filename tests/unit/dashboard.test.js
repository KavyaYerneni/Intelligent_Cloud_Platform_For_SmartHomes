import test from 'node:test';
import assert from 'node:assert/strict';
import {houseHealth} from '../../backend/domain.js';
test('Yaswanth: high alerts override offline, unknown never healthy',()=>{assert.equal(houseHealth([{status:'OFFLINE'}],[{state:'ACTIVE',severity:'HIGH'}]),'ALERT');assert.equal(houseHealth([{status:'OFFLINE'}],[]),'OFFLINE');assert.equal(houseHealth([],[]),'DEGRADED');assert.equal(houseHealth([{status:'REGISTERED'}],[]),'DEGRADED');assert.equal(houseHealth([{status:'ONLINE'}],[{state:'RESOLVED',severity:'CRITICAL'}]),'HEALTHY');});
