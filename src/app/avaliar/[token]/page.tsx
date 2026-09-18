'use client';
import { useEffect, useState } from 'react';
export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const [token,setToken]=useState(''); const [info,setInfo]=useState<{submitted?:boolean;serviceName?:string;businessName?:string;error?:string}>({}); const [rating,setRating]=useState(0); const [comment,setComment]=useState(''); const [sent,setSent]=useState(false);
  useEffect(()=>{ void params.then(({token})=>{setToken(token); fetch(`/api/reviews/${token}`).then(r=>r.json()).then(setInfo);});},[params]);
  async function submit(){const r=await fetch(`/api/reviews/${token}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating,comment,consentToPublish:true})}); if(r.ok)setSent(true); else setInfo(await r.json());}
  if(info.error) return <main className="mx-auto max-w-lg p-8">{info.error}</main>;
  if(info.submitted||sent) return <main className="mx-auto max-w-lg p-8 text-center"><h1 className="text-2xl font-bold">Obrigado pela sua avaliação!</h1><p className="mt-3 text-slate-600">A sua opinião foi registada.</p></main>;
  return <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-bold">Como foi a sua experiência?</h1><p className="mt-2 text-slate-600">{info.serviceName || 'O seu atendimento'} em {info.businessName || 'RP Instituto de Beleza'}</p><div className="mt-6 flex gap-2">{[1,2,3,4,5].map(n=><button key={n} onClick={()=>setRating(n)} className={`rounded-lg px-4 py-3 text-xl ${n<=rating?'bg-amber-400':'bg-slate-100'}`}>★</button>)}</div><textarea className="mt-5 w-full rounded-lg border p-3" rows={5} placeholder="Conte-nos como foi a sessão (opcional)" value={comment} onChange={e=>setComment(e.target.value)} /><button disabled={!rating} onClick={submit} className="mt-4 w-full rounded-lg bg-violet-600 p-3 font-semibold text-white disabled:opacity-50">Enviar avaliação</button></main>;
}
