import type { Metadata } from 'next';
import { PublicBusinessPage } from './site/[slug]/page';
import Link from 'next/link';
import { getDefaultPublicBusinessSlug, getPublicBusinessSite } from '@/lib/public-site/server';

export async function generateMetadata(): Promise<Metadata> {
  const slug = await getDefaultPublicBusinessSlug();
  const site = slug ? await getPublicBusinessSite(slug) : null;
  const name = site?.account.name || 'RP Instituto de Beleza';
  const description = site?.settings.hero_subtitle || 'Beleza, estética avançada, unhas e pestanas na Quinta do Conde.';
  return {
    title: name,
    description,
    robots: { index: true, follow: true },
    openGraph: { title: name, description, images: site?.settings.hero_image_url ? [site.settings.hero_image_url] : [] },
  };
}

export default async function RootPage() {
  const slug = await getDefaultPublicBusinessSlug();
  // The domain root is the business website, never the legacy directory.
  if (!slug) return <main style={{ padding: '4rem', textAlign: 'center' }}>
    <h1>RP Instituto de Beleza</h1>
    <p>Estamos a preparar o nosso novo espaço online.</p>
    <Link href="/install">Configurar a empresa</Link>
  </main>;
  return <PublicBusinessPage params={Promise.resolve({ slug })} />;
}
