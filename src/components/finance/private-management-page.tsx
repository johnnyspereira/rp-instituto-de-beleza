'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import { ArrowLeft, Landmark, Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

// A tesouraria inclui importação de ficheiros e vários diálogos. Carregá-la
// apenas depois de a página estar no browser evita que uma falha desse módulo
// derrube toda a rota /private-management durante a renderização inicial.
const OwnerTreasury = dynamic(
  () => import('@/components/finance/owner-treasury').then(({ OwnerTreasury }) => OwnerTreasury),
  {
    ssr: false,
    loading: () => (
      <section className="flex min-h-72 items-center justify-center rounded-2xl border bg-card p-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          A carregar a gestão privada…
        </div>
      </section>
    ),
  },
);

class TreasuryErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[private-management] treasury render failed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="font-semibold">A tesouraria não pôde ser aberta</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.error.message || 'Ocorreu um erro ao carregar este módulo.'}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </Button>
        </section>
      );
    }

    return this.props.children;
  }
}

export function PrivateManagementPage() {
  const { isOwner, profileLoading } = useAuth();

  if (profileLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <ShieldCheck className="mx-auto size-9 text-amber-700" />
        <h1 className="mt-4 text-xl font-semibold">Área reservada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A gestão privada só está disponível para o proprietário da conta.
        </p>
        <Button className="mt-5" variant="outline" render={<Link href="/finance" />}>
          <ArrowLeft /> Voltar ao Financeiro
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800">
            <Landmark className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Gestão privada</h1>
            <p className="text-muted-foreground text-sm">
              Tesouraria, contas a pagar e valores a receber.
            </p>
          </div>
        </div>
        <Button variant="outline" render={<Link href="/finance" />}>
          <ArrowLeft /> Financeiro
        </Button>
      </header>
      <TreasuryErrorBoundary>
        <OwnerTreasury />
      </TreasuryErrorBoundary>
    </div>
  );
}
