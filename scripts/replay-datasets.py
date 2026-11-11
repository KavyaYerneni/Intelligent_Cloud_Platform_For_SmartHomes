"""Replay the complete local collection through real inference across 18 rooms.
Standard library only. Short clips are silence-padded; long clips are split,
never truncated. A checkpoint resumes completed chunks after interruption.
Run: python scripts/replay-datasets.py [--limit 36] [--interval 1] [--reset]
"""
import argparse, io, json, os, time, wave, hashlib, urllib.request, urllib.error
from pathlib import Path
from itertools import zip_longest

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--limit',type=int,default=0)
parser.add_argument('--interval',type=float,default=1)
parser.add_argument('--reset',action='store_true')
args=parser.parse_args()
env={}
for line in ((ROOT/'.env').read_text().splitlines() if (ROOT/'.env').exists() else []):
 if '=' in line and not line.lstrip().startswith('#'):
  k,v=line.split('=',1);env[k.strip()]=v.strip().strip('\"').strip("'")
base=os.environ.get('API_URL','http://127.0.0.1:3000')+'/api/v1'
token=''
def request(path,body=None,headers=None):
 data=body if isinstance(body,bytes) else json.dumps(body).encode() if body is not None else None
 h={'Authorization':'Bearer '+token,'Content-Type':'application/json',**(headers or {})}
 with urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=h),timeout=120) as r:return json.load(r)
def login():
 global token
 token=request('/auth/login',{'email':'technician@demo.local','password':os.environ.get('DEMO_PASSWORD',env.get('DEMO_PASSWORD'))})['token']
login()
statefile=ROOT/'.runtime/dataset-replay.json';statefile.parent.mkdir(exist_ok=True)
state=json.loads(statefile.read_text()) if statefile.exists() and not args.reset else {'done':[],'failures':{},'run':str(time.time_ns())}
done=set(state['done']);sent=0
groups=[('Human audio',['','B','T'],'human'),('appliance_audio',['K','U'],'general'),('Animal Sound',['G'],'general')]
human_recordings={line.strip() for line in (ROOT/'ml/training-recordings.txt').read_text().splitlines() if not line.startswith('#')}
queues=[sorted((ROOT/'datasets'/name).rglob('*.wav')) for name,_,_ in groups]
print('Recorded dataset playback. Real model predictions. Files:',sum(map(len,queues)),flush=True)
reported={};lastbeat=0
def heartbeat():
 global lastbeat
 if time.monotonic()-lastbeat<15:return
 for h in ['001','002','003']:
  for suffix in ['','B','T','K','U','G']:
   dev='D'+h+suffix
   try:
    result=request('/devices/'+dev+'/heartbeat',{'timestamp':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'firmware':'dataset-replay-2.0','metrics':{},'reportedVersion':reported.get(dev,0)})
    reported[dev]=result['desiredVersion']
   except Exception as e:print('Heartbeat failed:',dev,type(e).__name__,flush=True)
 lastbeat=time.monotonic()
def save():
 state['done']=sorted(done);state['updatedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 temp=statefile.with_suffix('.tmp');temp.write_text(json.dumps(state));temp.replace(statefile)
try:
 for index,triplet in enumerate(zip_longest(*queues)):
  for g,file in enumerate(triplet):
   if file is None:continue
   name,suffixes,classifier=groups[g];suffix=suffixes[(index//3)%len(suffixes)];dev='D'+str(index%3+1).zfill(3)+suffix
   rel=file.relative_to(ROOT/'datasets').as_posix()
   if classifier=='human' and file.name not in human_recordings:classifier='general'
   try:
    with wave.open(str(file),'rb') as w:
     params=w.getparams();chunk=0
     while True:
      frames=w.readframes(w.getframerate()*5)
      if not frames:break
      key=rel+':'+str(chunk);chunk+=1
      if key in done:continue
      heartbeat()
      framebytes=w.getsampwidth()*w.getnchannels();minimum=int(w.getframerate()*.5)*framebytes
      if len(frames)<minimum:frames+=(b'\x80' if w.getsampwidth()==1 else b'\0')*(minimum-len(frames))
      buf=io.BytesIO()
      with wave.open(buf,'wb') as out:out.setparams(params);out.writeframes(frames)
      event='ds-'+hashlib.sha256((state['run']+key).encode()).hexdigest()[:40]
      for attempt in range(4):
       try:
        result=request('/devices/'+dev+'/audio',buf.getvalue(),{'Content-Type':'audio/wav','X-Event-Id':event,'X-Audio-Classifier':classifier,'X-Audio-Origin':'recorded-dataset'});break
       except urllib.error.HTTPError as e:
        if e.code==401:login()
        elif e.code==429:time.sleep(60);continue
        elif e.code<500:raise
        if attempt==3:raise
        time.sleep(3*(attempt+1))
      else:raise OSError('Inference retry limit exceeded')
      inf=result.get('inference') or {};done.add(key);state['failures'].pop(rel,None);sent+=1;save()
      print(f"{sent} | {dev} | {rel} [{chunk}] -> {inf.get('label')} {inf.get('confidence')} | alert: {result.get('alertPreview') or 'none'}",flush=True)
      if args.limit and sent>=args.limit:raise KeyboardInterrupt
      time.sleep(max(0,args.interval))
   except (urllib.error.URLError, wave.Error, OSError) as e:
    state['failures'][rel]=str(e);save();print('FAILED',rel,str(e),flush=True)
except KeyboardInterrupt:print('Playback stopped; checkpoint saved.',flush=True)
finally:save()
print(f'{sent} chunks sent this run; {len(done)} total completed; {len(state["failures"])} failed files.',flush=True)
