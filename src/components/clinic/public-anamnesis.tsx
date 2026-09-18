'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  ClipboardCheck,
  HeartPulse,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BodyPainMap } from '@/components/clinic/body-pain-map';
import {
  DEFAULT_ANAMNESIS_CONFIG,
  findMissingRequiredQuestion,
  mergeAnamnesisConfig,
  modalityMatches,
  questionAnswerKey,
  type AnamnesisFormConfig,
  type AnamnesisModality,
  type AnamnesisQuestion,
} from '@/lib/clinic/anamnesis-config';

type FormData = {
  status: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  birth_date: string | null;
  selected_modalities: string[];
  modality_locked?: boolean;
  answers: Record<string, unknown>;
  signature_name: string | null;
  submitted_at: string | null;
  service?: { name?: string; category?: string } | null;
  appointment?: { scheduled_start?: string } | null;
  account?: { name?: string; logo_url?: string | null } | null;
  form_title?: string | null;
  form_intro?: string | null;
  config?: Partial<AnamnesisFormConfig> | null;
  privacy?: { version: string; policy_url: string | null } | null;
};

export function PublicAnamnesis({
  token,
  publicSlug,
}: {
  token?: string;
  publicSlug?: string;
}) {
  const [form, setForm] = useState<FormData | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [identity, setIdentity] = useState({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
  });
  const [modalities, setModalities] = useState<string[]>([]);
  const [answers, setAnswers] = useState<
    Record<string, string | boolean | string[]>
  >({});
  const [signature, setSignature] = useState('');
  const [healthConsent, setHealthConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const endpoint = publicSlug
    ? `/api/anamnese/public/${encodeURIComponent(publicSlug)}`
    : `/api/anamnese/${encodeURIComponent(token || '')}`;

  useEffect(() => {
    fetch(endpoint, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        const next = payload.form as FormData;
        setForm(next);
        setIdentity({
          name: next.client_name || '',
          email: next.client_email || '',
          phone: next.client_phone || '',
          birthDate: next.birth_date || '',
        });
        setModalities(next.selected_modalities || []);
        setAnswers(
          (next.answers || {}) as Record<string, string | boolean | string[]>
        );
      })
      .catch((loadError) =>
        setError(loadError.message || 'Ficha indisponível.')
      );
  }, [endpoint]);

  function answer(key: string, value: string | boolean | string[]) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }
  function toggleModality(value: string) {
    setModalities((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }
  function toggleConfiguredModality(modality: AnamnesisModality) {
    if (modalityMatches(modality, modalities)) {
      setModalities((current) =>
        current.filter((item) => !modalityMatches(modality, [item]))
      );
      return;
    }
    toggleModality(modality.label);
  }

  async function submit() {
    if (!identity.name.trim() || !signature.trim())
      return toast.error('Preencha o nome e a assinatura.');
    if (!healthConsent || !privacyConsent)
      return toast.error('Aceite os consentimentos para enviar a ficha.');
    const missingQuestion = findMissingRequiredQuestion(
      mergeAnamnesisConfig(form?.config),
      modalities,
      answers
    );
    if (missingQuestion) {
      return toast.error(`Responda à pergunta: ${missingQuestion.label}`);
    }
    setSaving(true);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: identity.name,
        clientEmail: identity.email,
        clientPhone: identity.phone,
        birthDate: identity.birthDate,
        selectedModalities: modalities,
        answers: { ...answers, signature_data: signature },
        signatureName: identity.name,
        healthConsent,
        privacyConsent,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok)
      return toast.error(payload.error || 'Não foi possível enviar.');
    setSubmitted(true);
  }

  if (error)
    return <AnamnesisState title="Ficha indisponível" detail={error} />;
  if (!form)
    return (
      <AnamnesisState
        loading
        title="A preparar a sua ficha"
        detail="Só mais um instante."
      />
    );
  if (submitted)
    return (
      <AnamnesisState
        success
        title="Ficha enviada com sucesso"
        detail="A equipa clínica já recebeu as suas respostas. Uma cópia ficará disponível no Portal 360."
      />
    );

  const configuredModalities =
    form.config?.modalities
      ?.filter((item) => item.enabled !== false)
      .map((item) => ({ ...item, enabled: item.enabled !== false })) ||
    DEFAULT_ANAMNESIS_CONFIG.modalities;
  const activeModalities = configuredModalities.filter((modality) =>
    modalityMatches(modality, modalities)
  );
  const appointmentModality = form.service?.name || modalities[0] || '';
  const customQuestions = form.config?.customQuestions || [];

  return (
    <main className="min-h-screen bg-[#f5f7f6] text-[#17221b] [--background:#fff] [--border:#dce3df] [--foreground:#17221b] [--input:#cfd8d3] [--muted-foreground:#66736c] [--muted:#eef2f0]">
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex h-20 max-w-5xl items-center gap-3 px-5">
          {form.account?.logo_url ? (
            <img
              src={form.account.logo_url}
              alt=""
              className="size-10 rounded-md object-cover"
            />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-md bg-[#173c28] text-white">
              <Sparkles />
            </span>
          )}
          <div>
            <strong>{form.account?.name || 'Clínica'}</strong>
            <p className="text-muted-foreground text-xs">
              {form.form_title || 'Ficha clínica confidencial'}
            </p>
          </div>
          <span className="ml-auto hidden items-center gap-2 text-xs text-emerald-700 sm:flex">
            <LockKeyhole className="size-4" /> Ligação segura
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
        <section className="max-w-3xl">
          <span className="flex size-11 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
            <ClipboardCheck />
          </span>
          <h1 className="mt-5 text-3xl font-semibold sm:text-4xl">
            {form.form_title || 'Ficha de anamnese'}
          </h1>
          <p className="text-muted-foreground mt-3 leading-7">
            {form.form_intro ||
              'Estas informações ajudam a equipa a adaptar o atendimento com segurança. Responda com calma e indique qualquer condição relevante.'}
          </p>
          {form.service?.name && (
            <p className="mt-3 text-sm font-medium">
              Sessão: {form.service.name}
              {form.appointment?.scheduled_start
                ? ` · ${new Date(form.appointment.scheduled_start).toLocaleString('pt-PT', { dateStyle: 'long', timeStyle: 'short' })}`
                : ''}
            </p>
          )}
        </section>

        <div className="mt-8 space-y-4">
          <FormSection
            title="1. Identificação"
            detail="Dados da pessoa que realizará o atendimento."
            icon={ShieldCheck}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo *">
                <Input
                  value={identity.name}
                  onChange={(e) =>
                    setIdentity({ ...identity, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Data de nascimento">
                <Input
                  type="date"
                  value={identity.birthDate}
                  onChange={(e) =>
                    setIdentity({ ...identity, birthDate: e.target.value })
                  }
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={identity.email}
                  onChange={(e) =>
                    setIdentity({ ...identity, email: e.target.value })
                  }
                />
              </Field>
              <Field label="Telemóvel">
                <Input
                  value={identity.phone}
                  onChange={(e) =>
                    setIdentity({ ...identity, phone: e.target.value })
                  }
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="2. Saúde e segurança"
            detail="Informação geral antes de qualquer modalidade."
            icon={HeartPulse}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Objetivo principal">
                <Textarea
                  value={String(answers.goals || '')}
                  onChange={(e) => answer('goals', e.target.value)}
                  placeholder="Relaxamento, dor, recuperação, estética..."
                />
              </Field>
              <Field label="Alergias ou sensibilidades">
                <Textarea
                  value={String(answers.allergies || '')}
                  onChange={(e) => answer('allergies', e.target.value)}
                />
              </Field>
              <Field label="Medicação atual">
                <Textarea
                  value={String(answers.medication || '')}
                  onChange={(e) => answer('medication', e.target.value)}
                />
              </Field>
              <Field label="Cirurgias, lesões ou tratamentos recentes">
                <Textarea
                  value={String(answers.recent_history || '')}
                  onChange={(e) => answer('recent_history', e.target.value)}
                />
              </Field>
            </div>
            <CheckGrid
              title="Condições relevantes"
              values={[
                'Hipertensão',
                'Problemas cardíacos',
                'Diabetes',
                'Varizes ou trombose',
                'Problemas de pele',
                'Gravidez',
                'Epilepsia',
                'Doença oncológica',
              ]}
              selected={(answers.conditions as string[]) || []}
              onChange={(value) => answer('conditions', value)}
            />
          </FormSection>

          <FormSection
            title={
              form.modality_locked ? '3. A sua modalidade' : '3. Modalidades'
            }
            detail={
              form.modality_locked
                ? 'Esta é a modalidade escolhida no seu agendamento.'
                : 'Selecione o tipo de atendimento para abrir as perguntas específicas.'
            }
            icon={Activity}
          >
            {form.modality_locked ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="size-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm text-emerald-800">
                      A sua modalidade escolhida foi
                    </p>
                    <p className="mt-0.5 text-lg font-semibold">
                      {appointmentModality || 'Modalidade do agendamento'}
                    </p>
                    <p className="mt-1 text-sm text-emerald-700">
                      Esta informação está associada ao seu agendamento e não
                      precisa de ser selecionada novamente.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {configuredModalities.map((item) => (
                  <Toggle
                    key={item.id}
                    label={item.label}
                    active={modalityMatches(item, modalities)}
                    onClick={() => toggleConfiguredModality(item)}
                  />
                ))}
              </div>
            )}
            {activeModalities.map((modality) => (
              <Conditional key={modality.id} title={modality.label}>
                {(modality.questions || []).map((question) => (
                  <QuestionField
                    key={question.id}
                    question={question}
                    value={String(
                      answers[questionAnswerKey(question, true)] || ''
                    )}
                    onChange={(value) =>
                      answer(questionAnswerKey(question, true), value)
                    }
                  />
                ))}
              </Conditional>
            ))}
          </FormSection>

          {customQuestions.length > 0 && (
            <FormSection
              title="4. Questões adicionais"
              detail="Informações específicas definidas pela clínica."
              icon={ClipboardCheck}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {customQuestions.map((question) => (
                  <QuestionField
                    key={question.id}
                    question={question}
                    value={String(answers[`custom_${question.id}`] || '')}
                    onChange={(value) => answer(`custom_${question.id}`, value)}
                  />
                ))}
              </div>
            </FormSection>
          )}

          <FormSection
            title={`${customQuestions.length > 0 ? '5' : '4'}. Consentimento`}
            detail="Confirme as informações antes do envio."
            icon={ShieldCheck}
          >
            <Field label="Outras informações importantes">
              <Textarea
                value={String(answers.other_notes || '')}
                onChange={(e) => answer('other_notes', e.target.value)}
              />
            </Field>
            <Consent
              checked={healthConsent}
              onChange={setHealthConsent}
              text="Declaro que as informações de saúde prestadas são verdadeiras e comprometo-me a comunicar alterações relevantes."
            />
            <Consent
              checked={privacyConsent}
              onChange={setPrivacyConsent}
              text={`Dou o meu consentimento explícito ao tratamento confidencial dos dados de saúde exclusivamente para preparar, prestar e acompanhar este serviço. Li o aviso de privacidade${form.privacy?.version ? ` (versão ${form.privacy.version})` : ''} e sei que posso retirar o consentimento, sem afetar o tratamento anterior.`}
            />
            {form.privacy?.policy_url && (
              <a
                className="text-primary block text-xs underline"
                href={form.privacy.policy_url}
                target="_blank"
                rel="noreferrer"
              >
                Ler a política de privacidade completa
              </a>
            )}
            <Field label="Assinatura digital *">
              <SignaturePad value={signature} onChange={setSignature} />
              <p className="text-muted-foreground mt-2 text-xs">Desenhe a sua assinatura. O nome informado acima será associado a esta confirmação.</p>
            </Field>
          </FormSection>
        </div>
        <div className="mt-6 flex justify-end">
          <Button size="lg" onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Enviar
            ficha confidencial
          </Button>
        </div>
      </div>
    </main>
  );
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const locallyDrawn = useRef('');
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    // Do not clear a signature we have just drawn locally: React re-renders
    // immediately after pointer release, before the data URL image is ready.
    if (value && value === locallyDrawn.current) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const finish = () => { drawing.current = false; last.current = null; if (canvasRef.current) { const next = canvasRef.current.toDataURL('image/png'); locallyDrawn.current = next; onChange(next); } };
  return <div className="overflow-hidden rounded-xl border bg-white"><canvas ref={canvasRef} width={720} height={180} className="h-36 w-full touch-none cursor-crosshair" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; last.current = point(event); }} onPointerMove={(event) => { if (!drawing.current || !last.current) return; const next = point(event); const canvas = canvasRef.current!; const context = canvas.getContext('2d')!; context.strokeStyle = '#172554'; context.lineWidth = 2.4; context.lineCap = 'round'; context.beginPath(); context.moveTo(last.current.x, last.current.y); context.lineTo(next.x, next.y); context.stroke(); last.current = next; }} onPointerUp={finish} onPointerCancel={finish} /><div className="flex items-center justify-between border-t bg-slate-50 px-3 py-2"><span className="text-muted-foreground text-xs">Assine dentro da área branca</span><button type="button" className="text-xs font-medium text-primary" onClick={() => { const canvas = canvasRef.current; if (!canvas) return; locallyDrawn.current = ''; canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); onChange(''); }}>Limpar assinatura</button></div>{value && <span className="sr-only">Assinatura registada</span>}</div>;
}

function FormSection({
  title,
  detail,
  icon: Icon,
  children,
}: {
  title: string;
  detail: string;
  icon: typeof ShieldCheck;
  children: React.ReactNode;
}) {
  return (
    <details open className="border-border bg-background rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-5">
        <span className="bg-muted flex size-9 items-center justify-center rounded-md">
          <Icon className="size-4" />
        </span>
        <span>
          <strong className="block">{title}</strong>
          <span className="text-muted-foreground text-xs">{detail}</span>
        </span>
        <ChevronDown className="text-muted-foreground ml-auto size-4" />
      </summary>
      <div className="border-border space-y-5 border-t p-5">{children}</div>
    </details>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </label>
  );
}
function QuestionField({
  question,
  value,
  onChange,
}: {
  question: AnamnesisQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={question.type === 'body_map' ? 'sm:col-span-2' : undefined}>
      <Field label={`${question.label}${question.required ? ' *' : ''}`}>
        {question.type === 'body_map' ? (
          <BodyPainMap value={value} onChange={onChange} />
        ) : question.type === 'yes_no' ? (
          <select
            className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">Selecionar</option>
            <option value="Sim">Sim</option>
            <option value="Não">Não</option>
          </select>
        ) : question.type === 'text' ? (
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </Field>
    </div>
  );
}
function Conditional({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-emerald-500 pl-4">
      <h3 className="mb-3 font-medium">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}
function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 items-center gap-3 rounded-md border px-3 text-left text-sm ${active ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-border'}`}
    >
      <span
        className={`flex size-5 items-center justify-center rounded-sm border ${active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border'}`}
      >
        {active && <Check className="size-3" />}
      </span>
      {label}
    </button>
  );
}
function CheckGrid({
  title,
  values,
  selected,
  onChange,
}: {
  title: string;
  values: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <Toggle
            key={value}
            label={value}
            active={selected.includes(value)}
            onClick={() =>
              onChange(
                selected.includes(value)
                  ? selected.filter((item) => item !== value)
                  : [...selected, value]
              )
            }
          />
        ))}
      </div>
    </div>
  );
}
function Consent({
  checked,
  onChange,
  text,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  text: string;
}) {
  return (
    <label className="bg-muted/50 flex cursor-pointer gap-3 rounded-md p-4 text-sm leading-6">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4"
      />
      <span>{text}</span>
    </label>
  );
}
function AnamnesisState({
  title,
  detail,
  loading,
  success,
}: {
  title: string;
  detail: string;
  loading?: boolean;
  success?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f6] p-6 text-center">
      <div className="max-w-md">
        {loading ? (
          <Loader2 className="mx-auto size-8 animate-spin text-emerald-700" />
        ) : success ? (
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check />
          </span>
        ) : (
          <ShieldCheck className="mx-auto size-10 text-slate-500" />
        )}
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{detail}</p>
      </div>
    </main>
  );
}
