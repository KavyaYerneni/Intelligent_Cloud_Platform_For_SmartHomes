import React from 'react';
import {expect,test,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import TryModel from '../../frontend/views/ai/TryModel.jsx';
import {sourceDetail,sourceLabel} from '../../frontend/lib/source.js';

const model={name:'human-sounds',version:'1.0.0'};
const result=(over={})=>({label:'Cough',confidence:.95,eventType:'unusual_sound',alertPreview:'HIGH',testEmbedder:false,frames:10,latencyMs:120,
 model,audio:{durationSeconds:5,sampleRate:44100,channels:1,silent:false},audioSetTop:[{label:'Cough',score:.8}],
 probabilities:[{label:'Cough',probability:.95},{label:'Sneeze',probability:.05}],...over});

async function classify(body){
 const fetchMock=vi.fn(async()=>new Response(JSON.stringify(body),{status:200}));
 vi.stubGlobal('fetch',fetchMock);
 render(<TryModel model={model} serviceReady />);
 const file=new File([new Uint8Array([82,73,70,70])],'clip.wav',{type:'audio/wav'});
 fireEvent.change(document.querySelector('input[type=file]'),{target:{files:[file]}});
 fireEvent.click(screen.getByRole('button',{name:'Classify clip'}));
 await waitFor(()=>expect(screen.getByText('95% confident')).toBeInTheDocument());
 return fetchMock;
}

test('sends the WAV as the raw body and shows what the live clip would become',async()=>{
 const fetchMock=await classify(result());
 const [url,init]=fetchMock.mock.calls[0];
 expect(url).toBe('/api/v1/ai/test');
 expect(init.headers['Content-Type']).toBe('audio/wav');
 expect(init.body).toBeInstanceOf(File);
 expect(screen.getByText('unusual sound')).toBeInTheDocument();
 expect(screen.getByText('High')).toBeInTheDocument();
 expect(screen.queryByText(/not a real prediction/)).toBeNull();
 vi.unstubAllGlobals();
});

test('a test-embedder result is always marked as not real',async()=>{
 await classify(result({testEmbedder:true,alertPreview:null,eventType:'normal_activity_sound'}));
 expect(screen.getByText('Test embedder: this is not a real prediction.')).toBeInTheDocument();
 expect(screen.getByText(/stored without an alert/)).toBeInTheDocument();
 vi.unstubAllGlobals();
});

test('model events are described as AI, never as simulated',()=>{
 expect(sourceLabel('model')).toBe('AI model');
 expect(sourceDetail('model')).toBe('Detected by the trained AI model');
 expect(sourceDetail('simulator')).toBe('Simulated event');
});
