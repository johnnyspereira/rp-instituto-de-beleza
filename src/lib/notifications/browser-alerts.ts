export type BrowserNotificationPermission =
  NotificationPermission | 'unsupported';

interface BrowserNotificationOptions {
  title: string;
  body?: string | null;
  tag?: string;
  onClick?: () => void;
}

let audioContext: AudioContext | null = null;
let unlockListenersRegistered = false;

function canUseBrowserNotifications() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function getAudioContext() {
  if (typeof window === 'undefined' || !window.AudioContext) {
    return null;
  }
  audioContext ??= new window.AudioContext();
  return audioContext;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (!canUseBrowserNotifications()) return 'unsupported';
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!canUseBrowserNotifications()) return 'unsupported';
  return window.Notification.requestPermission();
}

export function showBrowserNotification({
  title,
  body,
  tag,
  onClick,
}: BrowserNotificationOptions) {
  if (!canUseBrowserNotifications()) return false;
  if (window.Notification.permission !== 'granted') return false;

  const notificationOptions: NotificationOptions = {
    body: body ?? undefined,
    tag,
  };

  const notification = new window.Notification(title, notificationOptions);

  notification.onclick = (event) => {
    event.preventDefault();
    window.focus();
    onClick?.();
    notification.close();
  };

  return true;
}

export function ensureNotificationSoundUnlocked() {
  if (unlockListenersRegistered || typeof window === 'undefined') return;
  unlockListenersRegistered = true;

  const unlock = () => {
    const context = getAudioContext();
    if (context?.state === 'suspended') {
      void context.resume();
    }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

export function playNotificationSound() {
  const context = getAudioContext();
  if (!context) return false;

  if (context.state === 'suspended') {
    void context.resume();
    if (context.state === 'suspended') return false;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.12);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.26);

  return true;
}
