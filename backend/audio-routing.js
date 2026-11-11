// Broad AudioSet predictions are observational; only explicit alarm labels
// enter the unusual-sound review rule. They never assert a smoke emergency.
export function broadPrediction(inf) {
 const top=inf.audioSetTop?.[0];
 if(!top) throw new Error('YAMNet returned no AudioSet categories.');
 return {...inf,label:top.label,confidence:top.score,
  model:{name:'yamnet-audioset',version:'1'},
  probabilities:inf.audioSetTop.map(x=>({label:x.label,probability:x.score}))};
}
export function broadEventType(label) {
 return /^(Smoke detector, smoke alarm|Fire alarm|Alarm|Siren|Glass|Shatter)$/i.test(label)?'unusual_sound':'normal_activity_sound';
}
