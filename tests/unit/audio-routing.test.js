import test from 'node:test';
import assert from 'node:assert/strict';
import {broadPrediction,broadEventType} from '../../backend/audio-routing.js';
test('general recordings use actual AudioSet scores, not the human classifier result',()=>{
 const result=broadPrediction({label:'Cough',confidence:.99,audioSetTop:[{label:'Dog',score:.72},{label:'Animal',score:.63}]});
 assert.equal(result.label,'Dog');assert.equal(result.confidence,.72);
 assert.equal(result.model.name,'yamnet-audioset');
 assert.equal(broadEventType(result.label),'normal_activity_sound');
 assert.equal(broadEventType('Smoke detector, smoke alarm'),'unusual_sound');
 assert.equal(broadEventType('Vacuum cleaner'),'normal_activity_sound');
 assert.throws(()=>broadPrediction({audioSetTop:[]}));
});
