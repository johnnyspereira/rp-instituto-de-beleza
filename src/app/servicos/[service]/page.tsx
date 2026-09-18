/* eslint-disable @next/next/no-img-element */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, Check, Clock3, TriangleAlert } from 'lucide-react';
import { getDefaultPublicBusinessSlug, getPublicBusinessSite } from '@/lib/public-site/server';
import { serviceSlug } from '@/lib/public-site/service-slug';

async function findService(serviceSlugParam: string) {
  const businessSlug = await getDefaultPublicBusinessSlug();
  if (!businessSlug) return null;
  const site = await getPublicBusinessSite(businessSlug);
  if (!site) return null;
  const service = site.services.find((item) => serviceSlug(item.name) === serviceSlugParam);
  return service ? { site, service } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ service: string }> }): Promise<Metadata> {
  const { service } = await params;
  const result = await findService(service);
  if (!result) return { title: 'Serviço não encontrado', robots: { index: false, follow: false } };
  const { site, service: item } = result;
  const description = item.public_presentation || item.description || `Conheça ${item.name} na ${site.account.name}.`;
  return { title: `${item.name} | ${site.account.name}`, description, openGraph: { title: `${item.name} | ${site.account.name}`, description, images: item.public_image_url ? [item.public_image_url] : site.settings.hero_image_url ? [site.settings.hero_image_url] : undefined } };
}

export default async function PublicServicePage({ params }: { params: Promise<{ service: string }> }) {
  const { service: serviceParam } = await params;
  const result = await findService(serviceParam);
  if (!result) notFound();
  const { site, service } = result;
  const { settings, account, portal } = site;
  const bookingUrl = settings.show_booking && portal?.booking_enabled ? `/portal?book=1&service=${encodeURIComponent(service.id)}` : '/#contacto';
  const price = Number(service.price) > 0 ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: service.currency || 'EUR' }).format(Number(service.price)) : 'Valor sob consulta';
  const benefits = Array.isArray(service.public_benefits) ? service.public_benefits.filter(Boolean) : [];
  const considerations = Array.isArray(service.public_considerations) ? service.public_considerations.filter(Boolean) : [];
  return <main className="min-h-screen bg-slate-50 text-slate-900" style={{ '--brand': settings.primary_color, '--dark': settings.accent_color } as React.CSSProperties}><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6"><Link href="/" className="flex items-center gap-3 font-semibold">{account.logo_url && <img src={account.logo_url} alt="" className="size-9 rounded-lg object-contain" />}{account.name}</Link><Link href="/#servicos" className="text-sm font-medium text-slate-600">Ver todos os serviços</Link></div></header><section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-20"><div>{service.public_image_url ? <img src={service.public_image_url} alt={service.name} className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl" /> : <div className="aspect-[4/3] rounded-3xl bg-gradient-to-br from-violet-100 via-white to-emerald-100" />}</div><div className="flex flex-col justify-center"><Link href="/#servicos" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)]"><ArrowLeft className="size-4" /> Todos os serviços</Link><p className="mt-7 text-sm font-semibold tracking-[.16em] text-[var(--brand)] uppercase">Modalidade</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{service.name}</h1><p className="mt-6 text-lg leading-8 text-slate-600">{service.public_presentation || service.description || 'Informação detalhada desta modalidade em atualização.'}</p><div className="mt-7 flex flex-wrap gap-3 text-sm"><span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm"><Clock3 className="size-4 text-[var(--brand)]" />{service.duration_minutes} minutos</span><span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm"><CalendarDays className="size-4 text-[var(--brand)]" />{price}</span></div>{!service.coming_soon ? <Link href={bookingUrl} className="mt-8 inline-flex w-fit items-center gap-2 rounded-xl bg-[var(--brand)] px-6 py-3 font-semibold text-white">Marcar esta experiência <CalendarDays className="size-4" /></Link> : <p className="mt-8 w-fit rounded-xl bg-amber-100 px-5 py-3 text-sm font-semibold text-amber-900">Esta modalidade estará disponível em breve.</p>}</div></section><section className="mx-auto grid max-w-6xl gap-6 px-4 pb-20 sm:px-6 md:grid-cols-2"><List title="Benefícios" icon={Check} items={benefits} tone="emerald" /><List title="Cuidados e contraindicações" icon={TriangleAlert} items={considerations} tone="amber" /></section><section className="border-t border-slate-200 bg-white"><div className="mx-auto max-w-6xl px-4 py-10 text-sm leading-7 text-slate-600 sm:px-6"><strong className="text-slate-900">Antes da sua sessão</strong><p className="mt-2">Partilhe connosco quaisquer preferências ou informações relevantes. A sessão é adaptada ao seu conforto; em caso de dúvida, contacte-nos antes de marcar.</p></div></section></main>;
}
function List({ title, icon: Icon, items, tone }: { title: string; icon: typeof Check; items: string[]; tone: 'emerald' | 'amber' }) { if (!items.length) return null; return <section className="rounded-2xl border border-slate-200 bg-white p-7"><h2 className="flex items-center gap-2 text-xl font-semibold"><span className={tone === 'emerald' ? 'rounded-lg bg-emerald-100 p-2 text-emerald-700' : 'rounded-lg bg-amber-100 p-2 text-amber-700'}><Icon className="size-5" /></span>{title}</h2><ul className="mt-5 space-y-3 text-sm leading-6 text-slate-600">{items.map((item) => <li key={item} className="flex gap-3"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" />{item}</li>)}</ul></section>; }
