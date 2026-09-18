export const PUBLIC_SITE_THEMES = [
  {
    id: 'spa',
    name: 'Spa editorial',
    description: 'Sereno, sofisticado e pensado para reservas.',
    industries: 'Spa, massagens, estética e bem-estar',
    primary: '#a98355',
    accent: '#243128',
    preview: 'from-[#e9e0d2] via-[#f8f5ee] to-[#536050]',
  },
  {
    id: 'wellness',
    name: 'Bem-estar',
    description: 'Acolhedor, orgânico e próximo.',
    industries: 'Massagem, estética, spa e terapias',
    primary: '#6d8b74',
    accent: '#24352b',
    preview: 'from-[#dfe9df] via-[#f7f4ed] to-[#b9cfbd]',
  },
  {
    id: 'clinic',
    name: 'Clínico',
    description: 'Limpo, seguro e profissional.',
    industries: 'Clínicas, saúde e consultórios',
    primary: '#0f8b8d',
    accent: '#123047',
    preview: 'from-[#dff5f3] via-white to-[#dcecf6]',
  },
  {
    id: 'luxury',
    name: 'Premium',
    description: 'Editorial, elegante e exclusivo.',
    industries: 'Marcas premium e experiências exclusivas',
    primary: '#b4935a',
    accent: '#171510',
    preview: 'from-[#171510] via-[#4a3d2c] to-[#c7a970]',
  },
  {
    id: 'corporate',
    name: 'Corporativo',
    description: 'Sólido, objetivo e confiável.',
    industries: 'Consultoria, serviços B2B e empresas',
    primary: '#2563eb',
    accent: '#0f1f3d',
    preview: 'from-[#dbe8ff] via-[#edf3ff] to-[#173465]',
  },
  {
    id: 'vibrant',
    name: 'Vibrante',
    description: 'Expressivo, moderno e enérgico.',
    industries: 'Fitness, beleza, eventos e criativos',
    primary: '#e83e8c',
    accent: '#31145f',
    preview: 'from-[#ff4f9a] via-[#864cff] to-[#22d3ee]',
  },
  {
    id: 'minimal',
    name: 'Minimalista',
    description: 'Essencial, editorial e atemporal.',
    industries: 'Arquitetura, fotografia e profissionais',
    primary: '#171717',
    accent: '#fafafa',
    preview: 'from-white via-[#e5e5e5] to-[#737373]',
  },
] as const;
export type PublicSiteThemeId = (typeof PUBLIC_SITE_THEMES)[number]['id'];
export function getPublicSiteTheme(id: string) {
  return (
    PUBLIC_SITE_THEMES.find((theme) => theme.id === id) ?? PUBLIC_SITE_THEMES[0]
  );
}
