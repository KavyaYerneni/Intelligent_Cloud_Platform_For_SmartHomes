import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AI_LABEL_MAP,ALERT_RULES,classify,eventTypeForLabel,eventSchema} from '../../backend/domain.js';
import {aiResult,explain} from '../../backend/processing.js';

const manifest=JSON.parse(readFileSync(new URL('../../ml/models/human-sounds/1.0.0/manifest.json',import.meta.url)));

test('Kavya/AI: label map covers exactly the trained model classes',()=>{
 assert.deepEqual(Object.keys(AI_LABEL_MAP).sort(),[...manifest.classes].sort());
 for(const m of Object.values(AI_LABEL_MAP))assert(ALERT_RULES.some(r=>r.type===m.type),`no alert rule for ${m.type}`);
 assert.equal(eventTypeForLabel('Not a class'),null);
});

test('Kavya/AI: model label + confidence drive the existing alert rules',()=>{
 const sev=(label,c)=>classify({type:eventTypeForLabel(label),confidence:c}).severity;
 assert.equal(sev('Baby cry, infant cry',0.9),'HIGH');
 assert.equal(sev('Baby cry, infant cry',0.6),null);
 assert.equal(sev('Cough',0.8),'MEDIUM');
 assert.equal(sev('Cough',0.95),'HIGH');
 assert.equal(sev('Laughter',0.99),null);
 assert.equal(eventSchema.safeParse({eventId:'E1',correlationId:'C1',houseId:'H1',deviceId:'D1',type:'normal_activity_sound',occurredAt:new Date().toISOString(),source:'model',confidence:.7,payload:{}}).success,true);
});

test('Kavya/AI: provenance distinguishes trained-model, test and simulated results',()=>{
 const e={tenant_id:'T1',id:'E1'};
 const payload={modelLabel:'Cough',model:{name:'human-sounds',version:'1.0.0',sha256:'abc'},probabilities:[{label:'Cough',probability:.9}],backbone:'YAMNet'};
 const model={type:'unusual_sound',confidence:.9,source:'model',payload};
 assert.equal(aiResult(e,model,{}).inference,'TRAINED_MODEL');
 assert.equal(aiResult(e,model,{}).label,'Cough');
 assert.equal(aiResult(e,{...model,payload:{...payload,testEmbedder:true}},{}).inference,'TEST_EMBEDDER');
 assert.equal(aiResult(e,{type:'smoke_alarm',confidence:null,source:'simulator'},{model:'deterministic-rules'}).inference,'SIMULATED_OR_RULE_BASED');
 assert.match(explain(model,ALERT_RULES[2]),/^AI model human-sounds 1\.0\.0 heard "Cough" \(90%\)/);
});
