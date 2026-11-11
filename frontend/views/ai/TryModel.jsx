import React, { useState } from 'react';
import { api } from '../../lib/api';
import { human } from '../../lib/format';
import Status from '../../ui/Status';
import Icon from '../../ui/Icon';
import { FormError, useSubmit } from '../../ui/Form';
import { Empty } from '../../ui/Feedback';
import { Bar } from './Bar';

/** Classify a WAV clip from this computer. Creates no event and no alert. */
export default function TryModel({ model, serviceReady }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const run = useSubmit(async () => {
    setResult(null);
    setResult(await api('/ai/test', { method: 'POST', audio: file }));
  });
  if (!model) return <div className="panel"><Empty title="No model loaded" /></div>;
  return (
    <div className="grid-two">
      <section className="panel" aria-labelledby="try-h">
        <header className="panel-head"><div><h2 id="try-h">Try the model on a clip</h2>
          <p className="muted">Pick a WAV file, for example one from your dataset. Testing creates no events or alerts.</p></div></header>
        <label className={`dropzone ${file ? 'has-file' : ''}`}>
          <Icon name="upload" size={22} />
          <span>{file ? file.name : 'Choose a WAV file'}</span>
          <small>{file ? `${Math.round(file.size / 1024)} KB` : 'Up to 30 seconds'}</small>
          <input type="file" accept=".wav,audio/wav,audio/x-wav" onChange={e => { setFile(e.target.files[0] || null); setResult(null); }} />
        </label>
        <button className="btn btn-primary" disabled={!file || run.busy || !serviceReady} onClick={() => run.run()}>
          {run.busy ? 'Classifying' : 'Classify clip'}
        </button>
        {run.busy && <p className="hint">The first clip after the service starts can take a few seconds while YAMNet warms up.</p>}
        <FormError error={run.error} />
      </section>

      <section className="panel" aria-labelledby="res-h" aria-live="polite">
        <header className="panel-head"><h2 id="res-h">Result</h2></header>
        {!result ? <p className="muted">The model's answer appears here.</p> : (
          <>
            {result.testEmbedder && <p className="banner banner-bad">Test embedder: this is not a real prediction.</p>}
            <p className="verdict"><span className="verdict-label">{result.label}</span><span className="verdict-conf">{Math.round(result.confidence * 100)}% confident</span></p>
            <p>As a live clip this would become <strong>{human(result.eventType).toLowerCase()}</strong>
              {result.alertPreview ? <> and raise a <Status value={result.alertPreview} /> alert.</> : <>, stored without an alert.</>}</p>
            <ul className="label-bars">
              {result.probabilities.map(p => (
                <li key={p.label}>
                  <span className="lb-name">{p.label}</span>
                  <Bar value={p.probability} label={`${Math.round(p.probability * 100)}%`} tone={p.label === result.label ? 'ok' : 'muted'} />
                  <span className="lb-meta">{(p.probability * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
            <dl className="facts">
              <dt>Audio</dt><dd>{result.audio.durationSeconds} s, {result.audio.sampleRate} Hz, {result.audio.channels === 1 ? 'mono' : `${result.audio.channels} channels`}{result.audio.silent ? ', nearly silent' : ''}</dd>
              <dt>Model</dt><dd>{result.model.name} {result.model.version}</dd>
              <dt>Time</dt><dd>{Math.round(result.latencyMs)} ms for {result.frames} audio frame{result.frames === 1 ? '' : 's'}</dd>
              {result.audioSetTop?.length > 0 && <><dt>YAMNet alone</dt><dd>{result.audioSetTop.map(x => x.label).join(', ')}<small className="sub">Google's general AudioSet guess, shown for context only</small></dd></>}
            </dl>
          </>
        )}
      </section>
    </div>
  );
}
