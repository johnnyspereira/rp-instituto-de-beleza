'use client';
import { GraduationCap } from 'lucide-react';
import { GlossaryView } from '@/components/support/glossary-view';
export function PortalHelp() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-primary flex items-center gap-2 text-sm font-medium">
          <GraduationCap className="size-4" />
          CENTRAL DE AJUDA
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Como podemos ajudar?</h1>
        <p className="text-muted-foreground mt-1">
          Encontre respostas e aprenda a utilizar o seu portal.
        </p>
      </header>
      <GlossaryView audience="client" />
    </div>
  );
}
