import type { MetadataRoute } from 'next';
import { getDefaultPublicBusinessSlug, getPublicBusinessSite } from '@/lib/public-site/server';
import { serviceSlug } from '@/lib/public-site/service-slug';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://rp-instituto.example').replace(/\/$/, '');
  const slug = await getDefaultPublicBusinessSlug();
  if (!slug) return [];
  const site = await getPublicBusinessSite(slug);
  if (!site) return [];
  const now = new Date();
  return [
    { url: origin, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    ...site.services.map((service) => ({ url: `${origin}/servicos/${serviceSlug(service.name)}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8 })),
    ...site.team.map((person) => ({ url: `${origin}/profissionais/${encodeURIComponent(person.professional_public_slug || person.id)}`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
