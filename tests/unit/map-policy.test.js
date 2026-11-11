import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../../backend/server.js';

test('map page allows origin-only tile referrers and keeps CSP restrictions',async()=>{
  const server=createServer(app);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/not-a-route`);
    assert.equal(response.headers.get('referrer-policy'),'strict-origin');
    assert.match(response.headers.get('content-security-policy'),/tile\.openstreetmap\.org/);
    assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
