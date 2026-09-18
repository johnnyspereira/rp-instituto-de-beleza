import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function InstallForm({ error }: { error?: string }) {
  return <main className="bg-background flex min-h-screen items-center justify-center px-4 py-10">
    <Card className="w-full max-w-lg"><CardHeader className="text-center">
      <div className="bg-primary/10 mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl"><Database className="text-primary h-6 w-6" /></div>
      <CardTitle>Instalação inicial</CardTitle><CardDescription>MySQL conectado. Crie a empresa e o primeiro administrador local.</CardDescription>
    </CardHeader><CardContent>
      <form action="/api/install" method="post" className="space-y-4">
        {error&&<div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
        <div className="space-y-2"><Label htmlFor="accountName">Nome da empresa</Label><Input id="accountName" name="accountName" defaultValue="RP Instituto de Beleza" required /></div>
        <div className="space-y-2"><Label htmlFor="fullName">Nome do administrador</Label><Input id="fullName" name="fullName" autoComplete="name" required /></div>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="password">Senha</Label><Input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required /></div>
          <div className="space-y-2"><Label htmlFor="confirmPassword">Confirmar senha</Label><Input id="confirmPassword" name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></div>
        </div>
        <Button type="submit" className="w-full">Concluir instalação</Button>
      </form>
    </CardContent></Card>
  </main>;
}
