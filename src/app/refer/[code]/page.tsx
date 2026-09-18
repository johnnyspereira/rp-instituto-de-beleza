'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Gift,
  HeartHandshake,
  Loader2,
  Share2,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  qualificationDescription,
  referralRewardDescription,
} from '@/lib/referrals/presentation';

type Program = {
  ok: true;
  code: string;
  business: { name: string; logo_url: string | null; currency: string };
  referrer_name: string;
  settings: {
    headline: string;
    description: string;
    terms: string | null;
    require_consent: boolean;
    friend_reward_type: string;
    friend_reward_value: number;
    referrer_reward_type: string;
    referrer_reward_value: number;
    qualification_event: string;
    minimum_qualifying_amount: number;
    friend_service_name: string | null;
    referrer_service_name: string | null;
    new_clients_only: boolean;
    campaign_ends_at: string | null;
    privacy_text: string | null;
  };
};

export default function ReferralLandingPage() {
  const { code } = useParams<{ code: string }>();
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    consent: false,
    website: '',
  });

  useEffect(() => {
    if (!code) return;
    fetch(`/api/referrals/${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setProgram(payload as Program);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : 'Link indisponível.'
        )
      )
      .finally(() => setLoading(false));
  }, [code]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const response = await fetch(`/api/referrals/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    setSubmitting(false);
    if (!response.ok) {
      setError(payload.error || 'Não foi possível concluir o registo.');
      return;
    }
    setSuccess(true);
  }

  if (loading) {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center">
        <Loader2 className="text-primary size-7 animate-spin" />
      </main>
    );
  }

  if (!program) {
    return (
      <main className="bg-background flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <HeartHandshake className="text-muted-foreground mx-auto size-10" />
          <h1 className="mt-4 text-2xl font-bold">Link indisponível</h1>
          <p className="text-muted-foreground mt-2">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="bg-background min-h-screen">
      <header className="border-border border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-5">
          {program.business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={program.business.logo_url}
              alt={program.business.name}
              className="size-9 rounded-md object-cover"
            />
          ) : (
            <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-md font-bold">
              {program.business.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="font-semibold">{program.business.name}</span>
        </div>
      </header>

      <section className="border-border bg-muted/25 border-b">
        <div className="mx-auto max-w-5xl px-5 py-10 md:py-14">
          <div className="text-primary flex items-center gap-2 text-sm font-semibold">
            <Gift className="size-4" /> Convite de {program.referrer_name}
          </div>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold md:text-4xl">
            {program.settings.headline}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-base leading-7">
            {program.settings.description}
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <div className="flex gap-3">
            <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-md">
              <Gift className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">O seu benefício</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Receba{' '}
                {referralRewardDescription({
                  type: program.settings.friend_reward_type,
                  value: program.settings.friend_reward_value,
                  currency: program.business.currency,
                  serviceName: program.settings.friend_service_name,
                })}{' '}
                {qualificationDescription(
                  program.settings.qualification_event,
                  program.settings.minimum_qualifying_amount,
                  program.business.currency
                )}
                .
              </p>
            </div>
          </div>
          <div className="border-border border-t pt-6">
            <h2 className="text-sm font-bold uppercase">Como funciona</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <PublicStep
                number="1"
                icon={Share2}
                title="Recebe o convite"
                detail={`${program.referrer_name} partilhou o seu código pessoal consigo.`}
              />
              <PublicStep
                number="2"
                icon={CalendarCheck}
                title="Agenda e realiza"
                detail={`A recompensa é libertada ${qualificationDescription(program.settings.qualification_event, program.settings.minimum_qualifying_amount, program.business.currency)}.`}
              />
              <PublicStep
                number="3"
                icon={WalletCards}
                title="Ambos ganham"
                detail={`Você recebe ${referralRewardDescription({ type: program.settings.friend_reward_type, value: program.settings.friend_reward_value, currency: program.business.currency, serviceName: program.settings.friend_service_name })} e quem indicou recebe ${referralRewardDescription({ type: program.settings.referrer_reward_type, value: program.settings.referrer_reward_value, currency: program.business.currency, serviceName: program.settings.referrer_service_name })}.`}
              />
            </div>
          </div>
          <div className="border-border grid gap-4 border-t pt-5 sm:grid-cols-2">
            <div className="flex gap-3 text-sm">
              <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="font-semibold">Elegibilidade</p>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {program.settings.new_clients_only
                    ? 'Exclusivo para novos clientes e uma participação por telemóvel.'
                    : 'Uma participação por telemóvel, sujeita às regras da campanha.'}
                </p>
              </div>
            </div>
            {program.settings.campaign_ends_at ? (
              <div className="flex gap-3 text-sm">
                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
                  <Clock3 className="size-4" />
                </span>
                <div>
                  <p className="font-semibold">Campanha válida até</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {new Date(
                      program.settings.campaign_ends_at
                    ).toLocaleDateString('pt-PT')}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-700">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Registo seguro</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {program.settings.privacy_text ||
                  'Os seus dados são usados apenas para gerir o convite, o contacto e o atendimento associado.'}
              </p>
            </div>
          </div>
          {program.settings.terms ? (
            <div className="border-border border-t pt-5">
              <h2 className="text-sm font-semibold">Condições</h2>
              <p className="text-muted-foreground mt-2 text-xs leading-5 whitespace-pre-line">
                {program.settings.terms}
              </p>
            </div>
          ) : null}
        </div>

        <div className="border-border bg-card rounded-lg border p-5 shadow-sm">
          {success ? (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <CheckCircle2 className="size-12 text-emerald-600" />
              <h2 className="mt-4 text-xl font-bold">Convite aceite</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Os seus dados foram registados. A equipa entrará em contacto
                consigo.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Aceitar o convite</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Preencha os seus dados para associar o benefício.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-name">Nome</Label>
                <Input
                  id="ref-name"
                  required
                  maxLength={120}
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-phone">Telemóvel</Label>
                <Input
                  id="ref-phone"
                  type="tel"
                  required
                  maxLength={24}
                  autoComplete="tel"
                  placeholder="+351 912 345 678"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-email">E-mail</Label>
                <Input
                  id="ref-email"
                  type="email"
                  maxLength={254}
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </div>
              <input
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                value={form.website}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    website: event.target.value,
                  }))
                }
              />
              {program.settings.require_consent ? (
                <label className="flex items-start gap-2.5 text-xs leading-5">
                  <input
                    type="checkbox"
                    required
                    checked={form.consent}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        consent: event.target.checked,
                      }))
                    }
                    className="mt-1"
                  />
                  Aceito que os meus dados sejam tratados apenas para registar
                  esta indicação, validar o benefício e permitir o contacto
                  necessário ao primeiro agendamento. Este consentimento não
                  autoriza campanhas de marketing e pode ser retirado.
                </label>
              ) : null}
              {error ? (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ArrowRight />
                )}
                Participar
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

function PublicStep({
  number,
  icon: Icon,
  title,
  detail,
}: {
  number: string;
  icon: typeof Share2;
  title: string;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs font-bold">
          {number}
        </span>
        <Icon className="text-primary size-4" />
      </div>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-xs leading-5">{detail}</p>
    </div>
  );
}
