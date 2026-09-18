import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowUpRight,
  Clock3,
  Database,
  HeartHandshake,
  LockKeyhole,
  Mail,
  Scale,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react';

import { supabaseAdmin } from '@/lib/flows/admin-client';

export const metadata: Metadata = {
  title: 'Política de privacidade',
  description:
    'Como recolhemos, utilizamos e protegemos os seus dados pessoais.',
  robots: { index: true, follow: true },
};

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = supabaseAdmin();
  const { data: portal } = await db
    .from('client_portal_settings')
    .select('account_id,slug,account:accounts(name,logo_url)')
    .ilike('slug', slug.trim())
    .maybeSingle();
  if (!portal) notFound();
  const { data: privacy } = await db
    .from('privacy_settings')
    .select('*')
    .eq('account_id', portal.account_id)
    .maybeSingle();
  const account = Array.isArray(portal.account)
    ? portal.account[0]
    : portal.account;
  const business = account?.name || 'RP Instituto de Beleza';
  const controller = privacy?.controller_name || business;
  const email = privacy?.controller_email || 'geral@rp-instituto.example';
  const portalUrl = portal.slug ? `/portal/${portal.slug}` : '/portal';
  const updated = privacy?.updated_at
    ? new Date(privacy.updated_at).toLocaleDateString('pt-PT')
    : 'data de publicação';
  const retention = [
    ['Dados de clientes', privacy?.contact_retention_months ?? 60],
    ['Dados de anamnese', privacy?.health_retention_months ?? 60],
    ['Registos de comunicações', privacy?.communication_retention_months ?? 24],
    [
      'Documentos e registos financeiros',
      privacy?.finance_retention_months ?? 120,
    ],
  ] as const;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,.12),transparent_34%),radial-gradient(circle_at_top_right,rgba(14,165,233,.1),transparent_28%),#f8fafc] text-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 text-white shadow-2xl shadow-violet-950/15">
          <div className="grid gap-8 px-6 py-9 sm:px-10 lg:grid-cols-[1fr_auto] lg:px-14 lg:py-12">
            <div className="max-w-3xl">
              <div className="mb-6 flex items-center gap-3">
                {account?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={account.logo_url}
                    alt=""
                    className="size-12 rounded-2xl bg-white object-contain p-1.5"
                  />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                    <ShieldCheck />
                  </span>
                )}
                <div>
                  <p className="font-semibold text-violet-200">{business}</p>
                  <p className="text-xs text-slate-400">
                    Privacidade, transparência e controlo
                  </p>
                </div>
              </div>
              <p className="mb-3 text-xs font-bold tracking-[.18em] text-violet-300 uppercase">
                Informação ao titular dos dados
              </p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
                Política de privacidade
              </h1>
              <p className="mt-5 max-w-2xl leading-7 text-slate-300">
                Explicamos que dados tratamos, por que motivo os utilizamos,
                durante quanto tempo os conservamos e como pode exercer os seus
                direitos.
              </p>
            </div>
            <div className="flex flex-col justify-end gap-2 text-sm text-slate-300 lg:text-right">
              <span>Versão {privacy?.privacy_notice_version || '1.0'}</span>
              <span>Atualizada em {updated}</span>
              <a
                href={`mailto:${email}`}
                className="mt-2 inline-flex items-center gap-2 font-semibold text-white hover:text-violet-200 lg:justify-end"
              >
                <Mail className="size-4" /> {email}
              </a>
            </div>
          </div>
        </header>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="sticky top-6 hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:block">
            <p className="mb-4 text-xs font-bold tracking-wider text-slate-500 uppercase">
              Nesta página
            </p>
            <nav className="space-y-1 text-sm">
              {[
                ['responsavel', 'Responsável'],
                ['dados', 'Dados tratados'],
                ['finalidades', 'Finalidades e bases legais'],
                ['origem', 'Origem dos dados'],
                ['partilha', 'Destinatários'],
                ['conservacao', 'Conservação'],
                ['direitos', 'Os seus direitos'],
                ['seguranca', 'Segurança e reclamações'],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="block rounded-lg px-3 py-2 text-slate-600 hover:bg-violet-50 hover:text-violet-800"
                >
                  {label}
                </a>
              ))}
            </nav>
            <Link
              href={portalUrl}
              className="mt-5 flex items-center justify-between rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Abrir Portal 360 <ArrowUpRight className="size-4" />
            </Link>
          </aside>

          <article className="space-y-5">
            <Section
              id="responsavel"
              icon={UserRoundCheck}
              title="Responsável pelo tratamento"
            >
              <p>
                O responsável pelo tratamento é <strong>{controller}</strong>
                {privacy?.controller_tax_id
                  ? `, NIF/NIPC ${privacy.controller_tax_id}`
                  : ''}
                {privacy?.controller_address
                  ? `, com morada em ${privacy.controller_address}`
                  : ''}
                . Contacto: <a href={`mailto:${email}`}>{email}</a>.
              </p>
              <p>
                {privacy?.dpo_email
                  ? `O contacto do EPD/DPO é ${privacy.dpo_email}.`
                  : 'Não foi designado Encarregado de Proteção de Dados (EPD/DPO). Os pedidos são tratados diretamente pelo responsável.'}
              </p>
            </Section>

            <Section
              id="dados"
              icon={Database}
              title="Categorias de dados pessoais"
            >
              <p>
                Podem ser tratados dados de identificação e contacto, incluindo
                nome, telefone e email; dados relativos a marcações, serviços
                realizados, packs e vouchers; dados necessários para faturação e
                pagamentos; registos de consentimentos e preferências de
                comunicação.
              </p>
              <p>
                Quando aplicável, tratamos informações fornecidas na anamnese,
                incluindo dados relativos à saúde estritamente necessários para
                avaliar a segurança e a adequada prestação dos serviços.
              </p>
            </Section>

            <Section
              id="finalidades"
              icon={Scale}
              title="Finalidades e fundamentos jurídicos"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Purpose title="Marcações e serviços">
                  Execução do contrato e diligências pré-contratuais — artigo
                  6.º, n.º 1, alínea b) do RGPD.
                </Purpose>
                <Purpose title="Faturação e pagamentos">
                  Execução do contrato e cumprimento de obrigações legais —
                  artigo 6.º, n.º 1, alíneas b) e c).
                </Purpose>
                <Purpose title="Comunicações operacionais">
                  Gestão de marcações e serviços. Estas mensagens não constituem
                  autorização para campanhas.
                </Purpose>
                <Purpose title="Packs e vouchers">
                  Emissão, entrega, utilização, validade e execução das
                  condições contratadas.
                </Purpose>
              </div>
              <Callout title="Anamnese e segurança do atendimento" tone="rose">
                A anamnese permite avaliar condições relevantes para a segurança
                dos serviços. O tratamento de dados de saúde depende do
                consentimento explícito do titular, nos termos do artigo 9.º,
                n.º 2, alínea a), conjugado com o artigo 6.º, n.º 1, alínea a),
                do RGPD. É independente do marketing e pode ser retirado a
                qualquer momento, sem afetar a licitude do tratamento anterior.
              </Callout>
              <Callout title="Marketing e campanhas" tone="violet">
                O marketing direto através de canais sujeitos a consentimento
                depende de autorização prévia, específica e informada, nos
                termos do artigo 6.º, n.º 1, alínea a), do RGPD e do artigo
                13.º-A da Lei n.º 41/2004. O consentimento é separado por canal
                e pode ser retirado gratuitamente. A recusa não impede marcações
                ou serviços.
              </Callout>
              <Callout title="Programa Indique e Ganhe" tone="amber">
                Tratamos apenas os dados necessários para registar a indicação,
                verificar a elegibilidade e executar o programa após a adesão. A
                indicação feita por outra pessoa não autoriza marketing ao amigo
                indicado; esse envio depende do consentimento do próprio.
              </Callout>
            </Section>

            <Section
              id="origem"
              icon={HeartHandshake}
              title="Origem dos dados pessoais"
            >
              <p>
                Os dados são, em regra, recolhidos diretamente junto do titular
                através de marcações, formulários, contactos e utilização dos
                serviços. No programa Indique e Ganhe, podemos receber de outro
                participante os dados mínimos relativos à indicação, limitando o
                tratamento à execução e gestão do programa.
              </p>
            </Section>

            <Section
              id="partilha"
              icon={HeartHandshake}
              title="Destinatários e transferências"
            >
              <p>
                O acesso é limitado aos profissionais autorizados e aos
                fornecedores necessários, como alojamento, email, comunicações,
                pagamentos, armazenamento e backups, sujeitos a deveres de
                confidencialidade e segurança.
              </p>
              <p>
                {privacy?.international_transfers ||
                  'Quando existam transferências internacionais, utilizamos um mecanismo legal adequado e as salvaguardas exigidas pelo RGPD.'}
              </p>
            </Section>

            <Section id="conservacao" icon={Clock3} title="Conservação">
              <p>
                Os dados são conservados apenas durante o período necessário e
                durante os prazos exigidos por lei. Salvo obrigação legal
                superior:
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                {retention.map(([label, months], index) => (
                  <div
                    key={label}
                    className={`flex justify-between gap-4 px-4 py-3 ${index ? 'border-t border-slate-200' : ''}`}
                  >
                    <span>{label}</span>
                    <strong className="whitespace-nowrap text-violet-700">
                      {months} meses
                    </strong>
                  </div>
                ))}
              </div>
              <p>
                No fim do prazo, os dados são eliminados ou anonimizados, salvo
                quando devam ser preservados para obrigações legais ou exercício
                e defesa de direitos.
              </p>
            </Section>

            <Section
              id="direitos"
              icon={UserRoundCheck}
              title="Os seus direitos"
            >
              <p>
                Pode exercer os direitos de acesso, retificação, apagamento,
                limitação, oposição e portabilidade pelo{' '}
                <Link href={portalUrl}>Portal 360</Link> ou através de{' '}
                <a href={`mailto:${email}`}>{email}</a>.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {[
                  'Aceder aos seus dados',
                  'Corrigir dados inexatos',
                  'Solicitar apagamento',
                  'Limitar o tratamento',
                  'Opor-se ao tratamento',
                  'Solicitar portabilidade',
                  'Retirar consentimentos',
                  'Opor-se ao marketing direto',
                ].map((right) => (
                  <li
                    key={right}
                    className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2"
                  >
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {right}
                  </li>
                ))}
              </ul>
              <p>
                O exercício é, em regra, gratuito. Para proteção dos dados,
                podemos confirmar a identidade. A retirada do consentimento não
                afeta a licitude do tratamento anterior.
              </p>
            </Section>

            <Section
              id="seguranca"
              icon={LockKeyhole}
              title="Segurança, incidentes e reclamações"
            >
              <p>
                Aplicamos medidas proporcionais ao risco, incluindo controlo de
                acessos, auditoria, proteção de sessões e backups. Os incidentes
                são avaliados e comunicados quando legalmente exigido.
              </p>
              <p>
                Pode reclamar junto da{' '}
                <a href="https://www.cnpd.pt" target="_blank" rel="noreferrer">
                  {privacy?.complaint_authority ||
                    'Comissão Nacional de Proteção de Dados (CNPD)'}
                </a>
                .
              </p>
            </Section>

            <footer className="rounded-2xl bg-slate-900 px-6 py-6 text-sm text-slate-300 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-white">
                  Dúvidas sobre os seus dados?
                </p>
                <p className="mt-1">Estamos disponíveis para ajudar.</p>
              </div>
              <a
                href={`mailto:${email}`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-slate-950 hover:bg-violet-100 sm:mt-0"
              >
                <Mail className="size-4" /> Contactar privacidade
              </a>
            </footer>
          </article>
        </div>
      </div>
    </main>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: typeof ShieldCheck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <Icon className="size-5" />
        </span>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          {title}
        </h2>
      </div>
      <div className="space-y-4 text-[15px] leading-7 text-slate-600 [&_a]:font-semibold [&_a]:text-violet-700 [&_a]:underline [&_a]:underline-offset-4 [&_strong]:text-slate-900">
        {children}
      </div>
    </section>
  );
}

function Purpose({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-6">{children}</p>
    </div>
  );
}

function Callout({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'rose' | 'violet' | 'amber';
  children: React.ReactNode;
}) {
  const color = {
    rose: 'border-rose-200 bg-rose-50/60',
    violet: 'border-violet-200 bg-violet-50/60',
    amber: 'border-amber-200 bg-amber-50/60',
  }[tone];
  return (
    <div className={`rounded-xl border p-5 ${color}`}>
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-6">{children}</p>
    </div>
  );
}
