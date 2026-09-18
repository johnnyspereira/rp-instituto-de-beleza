'use client';
import { GraduationCap } from 'lucide-react';
import { GlossaryView } from './glossary-view';
export function HelpCenter({ initialArticle }: { initialArticle?: string }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-primary flex items-center gap-2 text-sm font-medium">
          <GraduationCap className="size-4" />
          CENTRAL DE AJUDA
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Aprenda a usar o CRM</h1>
        <p className="text-muted-foreground mt-1">
          Tutoriais práticos para realizar tarefas com confiança.
        </p>
      </header>
      <GlossaryView initialArticle={initialArticle} />
    </div>
  );
}
