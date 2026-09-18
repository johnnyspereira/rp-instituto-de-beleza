'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleHelp } from 'lucide-react';
const ARTICLES: Record<string, { id: string; label: string }> = {
  dashboard: { id: 'dashboard', label: 'Entender o Painel' },
  inbox: { id: 'inbox', label: 'Como atender conversas' },
  contacts: { id: 'contacts', label: 'Usar o Cliente 360' },
  agenda: { id: 'agenda', label: 'Gerir marcações' },
  pipelines: { id: 'pipelines', label: 'Usar o Pipeline' },
  automations: { id: 'automations', label: 'Criar automações' },
  broadcasts: { id: 'broadcasts', label: 'Enviar transmissões' },
  finance: { id: 'finance', label: 'Entender o Financeiro' },
  reports: { id: 'reports', label: 'Interpretar relatórios' },
  settings: { id: 'portal', label: 'Configurar o Portal 360' },
  support: { id: 'support', label: 'Como funciona o suporte' },
  website: { id: 'public-website', label: 'Configurar o Site Público' },
};
export function ContextualHelp() {
  const pathname = usePathname();
  if (pathname.startsWith('/help')) return null;
  const segment = pathname.split('/').filter(Boolean)[0] ?? 'dashboard';
  const article = ARTICLES[segment];
  return (
    <Link
      href={article ? `/help?article=${article.id}` : '/help'}
      title={article?.label ?? 'Abrir Central de Ajuda'}
      className="bg-card text-foreground hover:bg-muted fixed right-20 bottom-5 z-40 hidden items-center gap-2 rounded-full border px-4 py-3 text-sm font-medium shadow-lg transition hover:-translate-y-0.5 lg:flex"
    >
      <CircleHelp className="text-primary size-5" />
      {article?.label ?? 'Precisa de ajuda?'}
    </Link>
  );
}
