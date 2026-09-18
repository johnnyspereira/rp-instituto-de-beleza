'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Lightbulb,
  Search,
  ThumbsDown,
  ThumbsUp,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CRM_LEARNING_ARTICLES } from '@/lib/support/glossary';
export function GlossaryView({
  audience = 'staff',
  initialArticle,
}: {
  audience?: 'staff' | 'client';
  initialArticle?: string;
}) {
  const [query, setQuery] = useState(''),
    [articleId, setArticleId] = useState<string | null>(initialArticle ?? null),
    [category, setCategory] = useState('Todos'),
    [completed, setCompleted] = useState<string[]>([]),
    [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const available = useMemo(
    () =>
      CRM_LEARNING_ARTICLES.filter(
        (a) => a.audience === 'all' || a.audience === audience
      ),
    [audience]
  );
  const categories = ['Todos', ...new Set(available.map((a) => a.category))];
  useEffect(() => {
    const prefix = audience === 'client' ? 'portal' : 'staff';
    try {
      // Restore progress recorded by this browser for the current academy.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompleted(
        JSON.parse(localStorage.getItem(`crm-help-${prefix}-completed`) ?? '[]')
      );
      setFeedback(
        JSON.parse(localStorage.getItem(`crm-help-${prefix}-feedback`) ?? '{}')
      );
    } catch {
      setCompleted([]);
      setFeedback({});
    }
  }, [audience]);
  function toggleComplete(id: string) {
    const next = completed.includes(id)
      ? completed.filter((item) => item !== id)
      : [...completed, id];
    setCompleted(next);
    localStorage.setItem(
      `crm-help-${audience === 'client' ? 'portal' : 'staff'}-completed`,
      JSON.stringify(next)
    );
  }
  function rate(id: string, value: 'up' | 'down') {
    const next = { ...feedback, [id]: value };
    setFeedback(next);
    localStorage.setItem(
      `crm-help-${audience === 'client' ? 'portal' : 'staff'}-feedback`,
      JSON.stringify(next)
    );
  }
  const articles = available.filter(
    (a) =>
      (category === 'Todos' || a.category === category) &&
      `${a.title} ${a.category} ${a.summary} ${a.purpose} ${a.steps.join(' ')} ${a.tips.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  const article = available.find((a) => a.id === articleId);
  if (article)
    return (
      <article className="mx-auto max-w-3xl">
        <Button variant="ghost" onClick={() => setArticleId(null)}>
          <ArrowLeft />
          Voltar à Central
        </Button>
        <div className="bg-card mt-4 rounded-2xl border p-5 md:p-8">
          <div className="flex items-center gap-3 text-xs">
            <span className="bg-primary/10 text-primary rounded-full px-3 py-1 font-medium">
              {article.category}
            </span>
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock3 className="size-3.5" />
              {article.duration}
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-semibold md:text-3xl">
            {article.title}
          </h2>
          <p className="text-muted-foreground mt-3 text-base leading-7">
            {article.purpose}
          </p>
          {article.href && audience === 'staff' && (
            <Link
              href={article.href}
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-5 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium"
            >
              Abrir esta área
              <ExternalLink className="size-4" />
            </Link>
          )}
          <div className="mt-8">
            <h3 className="text-lg font-semibold">Passo a passo</h3>
            <ol className="mt-4 space-y-4">
              {article.steps.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 leading-6">{step}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-8 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Lightbulb className="size-4 text-amber-600" />
              Boas práticas
            </h3>
            <ul className="mt-3 space-y-2">
              {article.tips.map((t) => (
                <li key={t} className="flex gap-2 text-sm leading-6">
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-600" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {article.related?.length ? (
            <div className="mt-8">
              <h3 className="font-semibold">Continue a aprender</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {article.related.map((id) => {
                  const related = available.find((a) => a.id === id);
                  return related ? (
                    <Button
                      key={id}
                      variant="outline"
                      onClick={() => setArticleId(id)}
                    >
                      {related.title}
                      <ArrowRight />
                    </Button>
                  ) : null;
                })}
              </div>
            </div>
          ) : null}
          <div className="mt-8 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant={completed.includes(article.id) ? 'outline' : 'default'}
              onClick={() => toggleComplete(article.id)}
            >
              <Check />
              {completed.includes(article.id)
                ? 'Tutorial concluído'
                : 'Marcar como concluído'}
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Foi útil?</span>
              <Button
                size="icon"
                variant={feedback[article.id] === 'up' ? 'default' : 'outline'}
                onClick={() => rate(article.id, 'up')}
                title="Sim, foi útil"
              >
                <ThumbsUp />
              </Button>
              <Button
                size="icon"
                variant={
                  feedback[article.id] === 'down' ? 'default' : 'outline'
                }
                onClick={() => rate(article.id, 'down')}
                title="Não resolveu"
              >
                <ThumbsDown />
              </Button>
            </div>
          </div>
        </div>
      </article>
    );
  return (
    <div className="space-y-6">
      <div className="from-primary/15 via-primary/5 rounded-2xl border bg-gradient-to-br to-transparent p-6 md:p-8">
        <div className="bg-primary/10 text-primary mb-4 flex size-11 items-center justify-center rounded-xl">
          <BookOpen />
        </div>
        <h2 className="text-2xl font-semibold">Academia do Produto</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl leading-6">
          Guias completos para dominar cada área do sistema, resolver dúvidas e
          concluir tarefas com segurança.
        </p>
        <div className="bg-background/80 mt-5 flex max-w-xl items-center gap-4 rounded-xl border p-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
            <Trophy className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">Seu progresso</span>
              <span className="text-muted-foreground">
                {completed.length} de {available.length}
              </span>
            </div>
            <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{
                  width: `${available.length ? Math.round((completed.length / available.length) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
        <div className="relative mt-5 max-w-xl">
          <Search className="text-muted-foreground absolute top-2.5 left-3 size-4" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="O que você quer aprender?"
            className="bg-background pl-9"
          />
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="text-lg font-semibold">Trilhas recomendadas</h3>
            <p className="text-muted-foreground text-sm">
              Comece pelo seu objetivo.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {(audience === 'client'
            ? [
                [
                  'Primeiros passos',
                  'Primeiros passos',
                  'Conheça o portal e proteja o seu acesso.',
                ],
                [
                  'Gerir a minha conta',
                  'Perfil e privacidade',
                  'Dados pessoais, preferências e segurança.',
                ],
                [
                  'Resolver um problema',
                  'Solução de problemas',
                  'Respostas rápidas para dificuldades comuns.',
                ],
              ]
            : [
                [
                  'Começar no CRM',
                  'Começar',
                  'Painel, atendimento e primeiros passos.',
                ],
                [
                  'Atender melhor',
                  'Atendimento',
                  'Conversas, respostas e organização.',
                ],
                [
                  'Administrar o sistema',
                  'Administração',
                  'Equipa, segurança e permissões.',
                ],
              ]
          ).map(([title, target, description]) => (
            <button
              key={title}
              onClick={() => setCategory(target)}
              className="bg-card hover:border-primary/40 rounded-xl border p-4 text-left transition"
            >
              <p className="font-semibold">{title}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {description}
              </p>
              <span className="text-primary mt-3 flex items-center gap-1 text-sm font-medium">
                Ver trilha <ArrowRight className="size-4" />
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={category === c ? 'default' : 'outline'}
            onClick={() => setCategory(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {articles.map((a) => (
          <button
            key={a.id}
            onClick={() => setArticleId(a.id)}
            className="bg-card group hover:border-primary/40 rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="text-primary text-xs font-medium">
                {a.category}
              </span>
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Clock3 className="size-3" />
                {a.duration}
              </span>
            </div>
            {completed.includes(a.id) && (
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700">
                <Check className="size-3" />
                Concluído
              </span>
            )}
            <h3 className="group-hover:text-primary mt-3 text-lg font-semibold">
              {a.title}
            </h3>
            <p className="text-muted-foreground mt-2 line-clamp-3 text-sm leading-6">
              {a.summary}
            </p>
            <span className="text-primary mt-4 flex items-center gap-1 text-sm font-medium">
              Ler tutorial
              <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </span>
          </button>
        ))}
      </div>
      {!articles.length && (
        <p className="text-muted-foreground py-12 text-center">
          Nenhum tutorial encontrado.
        </p>
      )}
    </div>
  );
}
