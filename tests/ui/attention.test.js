import {expect,test} from 'vitest';
import {needsAttention,reason} from '../../frontend/views/dashboard/health.js';
const NOW=Date.parse('2026-11-05T12:00:00Z');
const house=(name,health,extra={})=>({id:name,name,health,alerts:[],devices:[],lastSeen:null,...extra});

test('ranks alert, offline, degraded, then healthy-with-medium; hides all-clear houses',()=>{
  const hs=[house('A','HEALTHY'),house('B','DEGRADED'),house('C','ALERT',{alerts:[{type:'smoke_alarm',severity:'CRITICAL',deviceName:'S',createdAt:'2026-11-05T11:58:00Z'}]}),
    house('D','OFFLINE'),house('E','HEALTHY',{alerts:[{type:'unusual_sound',severity:'MEDIUM',deviceName:'M',createdAt:'2026-11-05T11:59:00Z'}]})];
  expect(needsAttention(hs).map(h=>h.name)).toEqual(['C','D','B','E']);
});

test('reasons are plain sentences',()=>{
  const alert=house('W','ALERT',{alerts:[{type:'smoke_alarm',severity:'CRITICAL',deviceName:'Kitchen sensor',createdAt:'2026-11-05T11:58:00Z'},{type:'human_help_sound',severity:'HIGH',deviceName:'Mic',createdAt:'2026-11-05T11:57:00Z'}]});
  expect(reason(alert,NOW)).toBe('Smoke alarm from Kitchen sensor, critical, 2 min ago. 1 more open alert.');
  const off=house('O','OFFLINE',{devices:[{name:'Mic',status:'OFFLINE'}],lastSeen:'2026-11-05T11:49:00Z'});
  expect(reason(off,NOW)).toBe('Mic is offline. Last heartbeat 11 min ago.');
  expect(reason(house('N','DEGRADED'),NOW)).toBe('No devices registered yet.');
});

test('registered devices explain the missing heartbeat, not a container failure',()=>{
  expect(reason(house('W','DEGRADED',{devices:[{name:'Mic',status:'REGISTERED',lastSeen:null}]}),NOW))
    .toBe('Mic is registered but awaiting the first heartbeat. Start the simulator to bring it online.');
  expect(reason(house('W','DEGRADED',{devices:[{name:'Mic',status:'PROVISIONING'}]}),NOW)).toContain('configuration');
});
