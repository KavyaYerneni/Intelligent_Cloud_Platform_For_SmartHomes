import React from 'react';
import {expect,test,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import Status,{look} from '../../frontend/ui/Status.jsx';
import {Confirm} from '../../frontend/ui/Overlay.jsx';
import {api,ApiError,setToken} from '../../frontend/lib/api.js';
import {toCsv} from '../../frontend/views/data/csv.js';

test('every lifecycle and device state has a text label and a shape',()=>{
  for(const s of ['ACTIVE','ACKNOWLEDGED','INVESTIGATING','ESCALATED','RESOLVED','ONLINE','OFFLINE','REGISTERED','PROVISIONING','ARCHIVED','PENDING','CONSISTENT','QUARANTINED','CRITICAL','HIGH','MEDIUM','HEALTHY','ALERT','DEGRADED']){
    const l=look(s);expect(l.label.length,s).toBeGreaterThan(0);expect(['dot','tri','half','ring','square']).toContain(l.shape);
  }
  // severity and alert state never share a look, so two badges side by side stay distinguishable
  expect(look('CRITICAL').shape).not.toBe(look('ACTIVE').shape);
});

test('status renders label text, not color alone',()=>{
  render(<Status value="OFFLINE"/>);
  expect(screen.getByText('Offline')).toBeInTheDocument();
  expect(document.querySelector('[data-shape="ring"]')).not.toBeNull();
});

test('confirm dialog names the action and Escape cancels',()=>{
  const onClose=vi.fn(),onConfirm=vi.fn();
  render(<Confirm title="Archive device?" action="Archive device" danger onClose={onClose} onConfirm={onConfirm}><p>History is kept.</p></Confirm>);
  expect(screen.getByRole('dialog',{name:'Archive device?'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Archive device'}));expect(onConfirm).toHaveBeenCalledOnce();
  fireEvent.keyDown(document,{key:'Escape'});expect(onClose).toHaveBeenCalledOnce();
});

test('api parses the shared error envelope and sends idempotency keys',async()=>{
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify({code:'DUPLICATE_SERIAL',message:'Taken',fieldErrors:[{field:'serialNo',message:'Already registered'}],existingDeviceId:'D9',correlationId:'c1'}),{status:409}));
  vi.stubGlobal('fetch',fetchMock);setToken('tok');
  const e=await api('/rooms/R1/devices',{method:'POST',body:{},key:'k-1'}).catch(x=>x);
  expect(e).toBeInstanceOf(ApiError);expect(e.field('serialNo')).toBe('Already registered');expect(e.body.existingDeviceId).toBe('D9');
  const headers=fetchMock.mock.calls[0][1].headers;
  expect(headers.Authorization).toBe('Bearer tok');expect(headers['Idempotency-Key']).toBe('k-1');expect(headers['X-Correlation-Id']).toMatch(/^ui-/);
  vi.unstubAllGlobals();
});

test('CSV export neutralises spreadsheet formulas',()=>{
  expect(toCsv([{a:'=HYPERLINK("x")',b:'plain'}],['a','b'])).toBe('a,b\r\n"\'=HYPERLINK(""x"")","plain"');
});
