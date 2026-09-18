'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTranslations } from 'next-intl';
import {
  CalendarClock,
  Check,
  Clock3,
  DollarSign,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquare,
  NotebookPen,
  Phone,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import type {
  ContactNote,
  Conversation,
  Deal,
  DealStatus,
  Message,
  PipelineStage,
  Profile,
} from '@/types';

interface DealDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  stages: PipelineStage[];
  onChanged: () => void;
  onEdit: (deal: Deal) => void;
}

type UpdatePatch = {
  stage_id?: string;
  status?: DealStatus;
  assigned_to?: string | null;
};

function relativeTime(date?: string | null) {
  if (!date) return '';
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
}

function formatDate(date?: string | null) {
  if (!date) return '--';
  return new Date(date).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusTone(status?: DealStatus) {
  if (status === 'won') return 'bg-emerald-500/15 text-emerald-600';
  if (status === 'lost') return 'bg-red-500/15 text-red-600';
  return 'bg-blue-500/15 text-blue-600';
}

function messagePreview(message: Message, fallback: string) {
  return (
    message.content_text?.trim() || `[${message.content_type || fallback}]`
  );
}

export function DealDetailPanel({
  open,
  onOpenChange,
  deal,
  stages,
  onChanged,
  onEdit,
}: DealDetailPanelProps) {
  const t = useTranslations('Pipelines.detail');
  const supabase = useMemo(() => createClient(), []);
  const { accountId, defaultCurrency } = useAuth();

  const [stageId, setStageId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [status, setStatus] = useState<DealStatus>('open');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [working, setWorking] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const currentStage = useMemo(
    () => stages.find((stage) => stage.id === stageId) ?? null,
    [stageId, stages]
  );

  const inboxHref = conversation ? `/inbox?c=${conversation.id}` : '/inbox';
  const contact = deal?.contact ?? null;
  const hasConversation = Boolean(conversation);

  useEffect(() => {
    if (!open || !deal) return;

    /* eslint-disable react-hooks/set-state-in-effect */
    setStageId(deal.stage_id);
    setAssignedTo(deal.assigned_to ?? '');
    setStatus(deal.status ?? 'open');
    setNewNote('');
    /* eslint-enable react-hooks/set-state-in-effect */

    let cancelled = false;
    (async () => {
      setLoadingData(true);

      const [profilesRes, notesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        deal.contact_id
          ? supabase
              .from('contact_notes')
              .select('*')
              .eq('contact_id', deal.contact_id)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      let resolvedConversation: Conversation | null = null;
      if (deal.conversation_id) {
        const { data } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', deal.conversation_id)
          .maybeSingle();
        resolvedConversation = (data as Conversation | null) ?? null;
      } else if (deal.contact_id) {
        const { data } = await supabase
          .from('conversations')
          .select('*')
          .eq('contact_id', deal.contact_id)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedConversation = (data as Conversation | null) ?? null;
      }

      let recentMessages: Message[] = [];
      if (resolvedConversation) {
        const { data } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', resolvedConversation.id)
          .order('created_at', { ascending: false })
          .limit(4);
        recentMessages = ((data ?? []) as Message[]).reverse();
      }

      if (cancelled) return;
      setProfiles((profilesRes.data ?? []) as Profile[]);
      setNotes((notesRes.data ?? []) as ContactNote[]);
      setConversation(resolvedConversation);
      setMessages(recentMessages);
      setLoadingData(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [deal, open, supabase]);

  const updateDeal = useCallback(
    async (patch: UpdatePatch) => {
      if (!deal) return false;
      setWorking(true);
      const { error } = await supabase
        .from('deals')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', deal.id);
      setWorking(false);

      if (error) {
        toast.error(t('toastUpdateFailed'));
        return false;
      }

      toast.success(t('toastUpdated'));
      onChanged();
      return true;
    },
    [deal, onChanged, supabase, t]
  );

  async function handleStageChange(nextStageId: string) {
    setStageId(nextStageId);
    const ok = await updateDeal({ stage_id: nextStageId });
    if (!ok && deal) setStageId(deal.stage_id);
  }

  async function handleAssignedChange(nextAssignee: string) {
    setAssignedTo(nextAssignee);
    const ok = await updateDeal({ assigned_to: nextAssignee || null });
    if (!ok && deal) setAssignedTo(deal.assigned_to ?? '');
  }

  async function handleStatusChange(nextStatus: DealStatus) {
    setStatus(nextStatus);
    const ok = await updateDeal({ status: nextStatus });
    if (!ok) setStatus(deal?.status ?? 'open');
  }

  async function handleAddNote() {
    if (!deal?.contact_id || !newNote.trim()) return;
    setSavingNote(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user || !accountId) {
      toast.error(t('toastNotAuthenticated'));
      setSavingNote(false);
      return;
    }

    const { error } = await supabase.from('contact_notes').insert({
      account_id: accountId,
      contact_id: deal.contact_id,
      user_id: user.id,
      note_text: newNote.trim(),
    });

    if (error) {
      toast.error(t('toastNoteFailed'));
      setSavingNote(false);
      return;
    }

    const { data } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', deal.contact_id)
      .order('created_at', { ascending: false });
    setNotes((data ?? []) as ContactNote[]);
    setNewNote('');
    setSavingNote(false);
    toast.success(t('toastNoteAdded'));
  }

  if (!deal) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="border-border bg-popover w-full sm:max-w-lg"
        />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="border-border bg-popover text-popover-foreground w-full gap-0 p-0 sm:max-w-2xl"
      >
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="border-border/60 border-b p-4">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0">
                <SheetTitle className="text-popover-foreground truncate text-base">
                  {deal.title}
                </SheetTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={statusTone(status)}>
                    {t(`status.${status}`)}
                  </Badge>
                  {currentStage && (
                    <Badge variant="outline" className="gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: currentStage.color }}
                      />
                      {currentStage.name}
                    </Badge>
                  )}
                  <Badge variant="outline" className="gap-1">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(
                      deal.value,
                      deal.currency ?? defaultCurrency
                    )}
                  </Badge>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEdit(deal)}
                className="shrink-0"
              >
                {t('edit')}
              </Button>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {loadingData ? (
              <div className="text-muted-foreground flex h-40 items-center justify-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('loading')}
              </div>
            ) : (
              <div className="space-y-4">
                <section className="border-border bg-card rounded-lg border p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Clock3 className="text-primary h-4 w-4" />
                    {t('quickActions')}
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {t('stage')}
                      </Label>
                      <select
                        value={stageId}
                        onChange={(event) =>
                          handleStageChange(event.target.value)
                        }
                        disabled={working}
                        className="border-border bg-muted focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
                      >
                        {stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {t('assignedTo')}
                      </Label>
                      <select
                        value={assignedTo}
                        onChange={(event) =>
                          handleAssignedChange(event.target.value)
                        }
                        disabled={working}
                        className="border-border bg-muted focus:border-primary h-9 w-full rounded-lg border px-2.5 text-sm outline-none"
                      >
                        <option value="">{t('unassigned')}</option>
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.full_name || profile.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-muted-foreground text-xs">
                        {t('statusLabel')}
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {(['open', 'won', 'lost'] as DealStatus[]).map(
                          (nextStatus) => (
                            <Button
                              key={nextStatus}
                              type="button"
                              variant={
                                status === nextStatus ? 'default' : 'outline'
                              }
                              size="sm"
                              disabled={working}
                              onClick={() => handleStatusChange(nextStatus)}
                              className="min-w-[86px] flex-1 px-2"
                            >
                              {nextStatus === 'won' && (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              {nextStatus === 'lost' && (
                                <X className="h-3.5 w-3.5" />
                              )}
                              {t(`status.${nextStatus}`)}
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4">
                  <div className="border-border bg-card rounded-lg border p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <UserRound className="text-primary h-4 w-4" />
                      {t('contact')}
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-foreground font-medium">
                        {contact?.name || contact?.phone || t('noContact')}
                      </p>
                      {contact?.phone && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5" />
                          {contact.phone}
                        </p>
                      )}
                      {contact?.email && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5" />
                          {contact.email}
                        </p>
                      )}
                      {contact?.company && (
                        <p className="text-muted-foreground">
                          {contact.company}
                        </p>
                      )}
                    </div>
                    <Link
                      href={inboxHref}
                      className="border-border bg-background hover:bg-muted hover:text-foreground mt-4 inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium transition-colors"
                    >
                      <MessageSquare className="h-4 w-4" />
                      {hasConversation ? t('openInbox') : t('goToInbox')}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  <div className="border-border bg-card rounded-lg border p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <CalendarClock className="text-primary h-4 w-4" />
                      {t('importantData')}
                    </div>
                    <dl className="space-y-2 text-xs">
                      <div className="bg-muted/60 flex items-center justify-between gap-3 rounded-md p-2">
                        <dt className="text-muted-foreground min-w-0">
                          {t('expectedClose')}
                        </dt>
                        <dd className="shrink-0 text-right font-semibold">
                          {formatDate(deal.expected_close_date)}
                        </dd>
                      </div>
                      <div className="bg-muted/60 flex items-center justify-between gap-3 rounded-md p-2">
                        <dt className="text-muted-foreground min-w-0">
                          {t('created')}
                        </dt>
                        <dd className="shrink-0 text-right font-semibold">
                          {formatDate(deal.created_at)}
                        </dd>
                      </div>
                      <div className="bg-muted/60 flex items-center justify-between gap-3 rounded-md p-2">
                        <dt className="text-muted-foreground min-w-0">
                          {t('lastUpdate')}
                        </dt>
                        <dd className="shrink-0 text-right font-semibold">
                          {relativeTime(deal.updated_at ?? deal.created_at)}
                        </dd>
                      </div>
                      <div className="bg-muted/60 flex items-center justify-between gap-3 rounded-md p-2">
                        <dt className="text-muted-foreground min-w-0">
                          {t('conversation')}
                        </dt>
                        <dd className="shrink-0 text-right font-semibold">
                          {hasConversation ? t('linked') : t('notLinked')}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <section className="border-border bg-card rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <MessageSquare className="text-primary h-4 w-4" />
                      {t('conversationTimeline')}
                    </div>
                    {conversation?.last_message_at && (
                      <span className="text-muted-foreground text-xs">
                        {relativeTime(conversation.last_message_at)}
                      </span>
                    )}
                  </div>
                  {!hasConversation ? (
                    <p className="bg-muted/60 text-muted-foreground rounded-md p-3 text-sm">
                      {t('noConversation')}
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="bg-muted/60 text-muted-foreground rounded-md p-3 text-sm">
                      {t('noMessages')}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {messages.map((message) => (
                        <div
                          key={message.id}
                          className="border-border/70 bg-muted/40 rounded-md border p-2"
                        >
                          <div className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
                            <span>{t(`sender.${message.sender_type}`)}</span>
                            <span>{relativeTime(message.created_at)}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm">
                            {messagePreview(message, t('message'))}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="border-border bg-card rounded-lg border p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <NotebookPen className="text-primary h-4 w-4" />
                    {t('notes')}
                  </div>
                  <Textarea
                    value={newNote}
                    onChange={(event) => setNewNote(event.target.value)}
                    placeholder={t('notePlaceholder')}
                    className="border-border bg-muted min-h-20"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddNote}
                    disabled={savingNote || !newNote.trim() || !deal.contact_id}
                    className="mt-2"
                  >
                    {savingNote && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('saveNote')}
                  </Button>

                  <div className="mt-4 space-y-2">
                    {notes.length === 0 ? (
                      <p className="bg-muted/60 text-muted-foreground rounded-md p-3 text-sm">
                        {t('noNotes')}
                      </p>
                    ) : (
                      notes.slice(0, 5).map((note) => (
                        <div
                          key={note.id}
                          className="border-border/70 bg-muted/40 rounded-md border p-3"
                        >
                          <p className="text-sm whitespace-pre-wrap">
                            {note.note_text}
                          </p>
                          <p className="text-muted-foreground mt-2 text-[11px]">
                            {relativeTime(note.created_at)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
