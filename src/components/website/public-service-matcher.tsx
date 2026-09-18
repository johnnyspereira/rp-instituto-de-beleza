'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { serviceSlug } from '@/lib/public-site/service-slug';

type Service = { id: string; name: string; description?: string | null; public_presentation?: string | null; duration_minutes: number; price: number; currency: string; coming_soon?: boolean };
const goals = [
  { id: 'relaxar', label: 'Relaxar e desligar', words: ['relaxante', 'velas', 'sensorial', 'lomi'] },
  { id: 'tensao', label: 'Soltar a tensão do dia', words: ['terapêutica', 'desportiva', 'pedras', 'ventosa'] },
  { id: 'pes', label: 'Cuidar dos pés', words: ['pés', 'podal'] },
  { id: 'estetica', label: 'Cuidado estético', words: ['esfoliação', 'facial', 'depilação', 'sobrancelhas', 'anti-envelhecimento'] },
  { id: 'rotina', label: 'Recuperar após a rotina', words: ['desportiva', 'modeladora', 'terapêutica', 'relaxante'] },
];
export function PublicServiceMatcher({ services }: { services: Service[] }) {
  const [goal, setGoal] = useState<string | null>(null);
  const selected = goals.find((item) => item.id === goal);
  const matches = selected ? services.filter((service) => selected.words.some((word) => `${service.name} ${service.description || ''} ${service.public_presentation || ''}`.toLocaleLowerCase('pt-PT').includes(word))).slice(0, 3) : [];
  return <section className="bg-slate-50"><div className="mx-auto max-w-7xl px-4 py-24 sm:px-6"><div className="max-w-2xl"><p className="text-sm font-semibold text-[var(--brand)]">ENCONTRE A SUA EXPERIÊNCIA</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">O que procura hoje?</h2><p className="mt-4 leading-7 text-slate-500">Escolha um objetivo e veja modalidades que podem combinar com o seu momento. A decisão final é sempre sua e a sessão é ajustada ao seu conforto.</p></div><div className="mt-9 flex flex-wrap gap-3">{goals.map((item) => <button key={item.id} type="button" onClick={() => setGoal(item.id)} className={`rounded-full border px-4 py-2.5 text-sm font-medium transition ${goal === item.id ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-[var(--brand)]'}`}>{item.label}</button>)}</div>{selected && <div className="mt-8 grid gap-4 md:grid-cols-3">{matches.length ? matches.map((service) => <Link key={service.id} href={`/servicos/${serviceSlug(service.name)}`} className="site-card rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><Sparkles className="size-5 text-[var(--brand)]" /><h3 className="mt-4 font-semibold">{service.name}</h3><p className="mt-2 text-sm text-slate-500">{service.duration_minutes} min · {Number(service.price) > 0 ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: service.currency || 'EUR' }).format(Number(service.price)) : 'Sob consulta'}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--brand)]">Conhecer <ArrowRight className="size-4" /></span></Link>) : <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 md:col-span-3">Ainda não há uma sugestão publicada para esta opção. Contacte-nos e ajudamos a encontrar a experiência certa.</p>}</div>}</div></section>;
}
