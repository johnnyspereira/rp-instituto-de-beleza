'use client';

import { useEffect, useState } from 'react';
import { BellRing, Download, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

const DISMISSED_KEY = 'wacrm:push-notifications:dismissed-at';
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function decodeKey(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PushNotifications({
  endpoint = '/api/push/subscriptions',
}: {
  endpoint?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installEvent, setInstallEvent] = useState<Event | null>(null);

  useEffect(() => {
    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_KEY));
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_FOR_MS) {
      setDismissed(true);
    }
    const available =
      window.isSecureContext &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(available);
    if (available) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(async (registration) => {
          setSubscribed(
            Boolean(await registration.pushManager.getSubscription())
          );
        })
        .catch(() => setSupported(false));
    }
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, []);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const keyResponse = await fetch('/api/push/public-key');
      const keyPayload = (await keyResponse.json().catch(() => null)) as {
        publicKey?: string;
        error?: string;
      } | null;
      if (!keyResponse.ok || !keyPayload?.publicKey) {
        throw new Error(
          keyPayload?.error || 'As notificações ainda não estão configuradas.'
        );
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(
          permission === 'denied'
            ? 'As notificações estão bloqueadas no navegador. Autorize-as nas definições do site.'
            : 'A autorização das notificações não foi concluída.'
        );
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(keyPayload.publicKey),
        }));
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      const responsePayload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          responsePayload?.error || 'Não foi possível guardar a subscrição.'
        );
      }
      setSubscribed(true);
      toast.success('Notificações ativadas neste dispositivo.');
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Não foi possível ativar as notificações.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    const prompt = installEvent as Event & { prompt?: () => Promise<void> };
    await prompt.prompt?.();
    setInstallEvent(null);
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissed(true);
  }

  if (
    dismissed ||
    (!supported && !installEvent) ||
    (subscribed && !installEvent)
  )
    return null;

  return (
    <div className="border-primary/30 bg-background fixed right-4 bottom-4 z-[80] w-[calc(100vw-2rem)] max-w-sm rounded-xl border p-4 shadow-xl">
      <button
        className="text-muted-foreground absolute top-2 right-2 p-2"
        onClick={dismiss}
        aria-label="Fechar"
      >
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-6">
        <BellRing className="text-primary mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">Receber notificações no telemóvel</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Ative alertas mesmo quando o CRM não estiver aberto.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!subscribed && supported && (
          <Button size="sm" onClick={() => void subscribe()} disabled={busy}>
            {busy ? 'A ativar…' : 'Ativar notificações'}
          </Button>
        )}
        {installEvent && (
          <Button size="sm" variant="outline" onClick={() => void install()}>
            <Download /> Instalar app
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Agora não
        </Button>
      </div>
      {error && (
        <p className="text-destructive mt-3 text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
