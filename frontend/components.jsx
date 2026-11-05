import React,{useState} from 'react';
export function Badge({children}){return <span className={`badge ${String(children).toLowerCase()}`}>{String(children).replaceAll('_',' ')}</span>;}
export function Panel({title,subtitle,children,actions}){return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{actions}</div>{children}</section>;}
export function Empty({children='No records in this view.'}){return <p className="empty">{children}</p>;}
export function Field({label,children,...props}){return <label className="field"><span>{label}</span>{children||<input {...props}/>}</label>;}
export function Json({value}){return <pre>{JSON.stringify(value,null,2)}</pre>;}
export function Form({onSubmit,children,label='Save'}){const [error,setError]=useState(''),[busy,setBusy]=useState(false);return <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSubmit(Object.fromEntries(new FormData(e.currentTarget)));}catch(error){setError(error.message);}finally{setBusy(false);}}}>{children}{error&&<p role="alert" className="error">{error}</p>}<button disabled={busy}>{busy?'Saving…':label}</button></form>;}
export function Action({onClick,children,...props}){const [busy,setBusy]=useState(false),[error,setError]=useState('');return <><button {...props} disabled={busy||props.disabled} onClick={async()=>{setBusy(true);setError('');try{await onClick();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{children}</button>{error&&<span role="alert" className="error">{error}</span>}</>;}
