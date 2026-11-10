// The simulator preview must agree with the server's classify() for every rule
// and confidence value, because both read ALERT_RULES.
import {describe,expect,test} from 'vitest';
import {ALERT_RULES,classify} from '../../backend/domain.js';
import {preview,ruleText} from '../../frontend/views/simulator/preview.js';

describe('simulator preview matches server classification',()=>{
  for(const rule of ALERT_RULES){
    test(rule.type,()=>{
      for(let i=0;i<=100;i++){
        const c=i/100;
        const server=classify({type:rule.type,confidence:rule.rule==='safety'?null:c}).severity;
        expect(preview(rule,c).severity,`${rule.type} at ${c}`).toBe(server);
      }
    });
  }
  test('rule descriptions are readable',()=>{
    expect(ruleText(ALERT_RULES.find(r=>r.type==='unusual_sound'))).toBe('Medium at 0.75 or more, high at 0.90');
    expect(ruleText(ALERT_RULES.find(r=>r.type==='smoke_alarm'))).toBe('Always critical');
    expect(ruleText(ALERT_RULES.find(r=>r.type==='telemetry'))).toBe('Never alerts');
  });
});
