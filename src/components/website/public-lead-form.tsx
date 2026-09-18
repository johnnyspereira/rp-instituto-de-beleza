'use client';
import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
export function PublicLeadForm({
  slug,
  primaryColor,
}: {
  slug: string;
  primaryColor: string;
}) {
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState(''),
    [subject, setSubject] = useState(''),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/site/${encodeURIComponent(slug)}/contact`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, subject, message }),
        }
      );
      const text = await response.text();
      let payload: { error?: string } = {};
      let isJson = false;
      try {
        payload = JSON.parse(text) as { error?: string };
        isJson = true;
      } catch {
        payload = {};
      }
      if (!response.ok || !isJson)
        return setError(payload.error || 'Não foi possível enviar.');
      setSent(true);
    } catch {
      setError('Não foi possível contactar o servidor.');
    } finally {
      setLoading(false);
    }
  }
  if (sent)
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-900">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <h3 className="mt-4 text-xl font-semibold">Mensagem enviada</h3>
        <p className="mt-2 text-sm text-emerald-800/70">
          A equipa recebeu o seu contacto e responderá assim que possível.
        </p>
      </div>
    );
  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-4 rounded-2xl border bg-white p-5 shadow-xl md:p-7"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="lead-name">Nome *</Label>
          <Input
            id="lead-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </div>
        <div>
          <Label htmlFor="lead-phone">Telefone *</Label>
          <Input
            id="lead-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            minLength={6}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="lead-email">Email</Label>
        <Input
          id="lead-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="lead-subject">Assunto</Label>
        <Input
          id="lead-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="lead-message">Como podemos ajudar? *</Label>
        <Textarea
          id="lead-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={3}
          maxLength={3000}
          className="min-h-28"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button
        type="submit"
        className="w-full text-white"
        style={{ backgroundColor: primaryColor }}
        disabled={loading}
      >
        {loading ? <Loader2 className="animate-spin" /> : <Send />}Enviar
        mensagem
      </Button>
      <p className="text-center text-[11px] text-slate-500">
        Ao enviar, autoriza o contacto da empresa sobre esta solicitação.
      </p>
    </form>
  );
}
