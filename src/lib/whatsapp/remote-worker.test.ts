import { afterEach, describe, expect, it } from 'vitest';

import { remoteWhatsAppWorker } from './remote-worker';

const original = {
  mode: process.env.WHATSAPP_MODE,
  url: process.env.WHATSAPP_WORKER_URL,
  secret: process.env.WHATSAPP_WORKER_SECRET,
  nodeEnv: process.env.NODE_ENV,
};

afterEach(() => {
  restore('WHATSAPP_MODE', original.mode);
  restore('WHATSAPP_WORKER_URL', original.url);
  restore('WHATSAPP_WORKER_SECRET', original.secret);
  restore('NODE_ENV', original.nodeEnv);
});

describe('remoteWhatsAppWorker.enabled', () => {
  it('uses runtime remote_worker mode', () => {
    process.env.WHATSAPP_MODE = 'remote_worker';
    process.env.WHATSAPP_WORKER_URL = 'https://worker.example.test';
    process.env.WHATSAPP_WORKER_SECRET = 'secret';
    expect(remoteWhatsAppWorker.enabled()).toBe(true);
  });

  it('requires the explicit remote_worker mode', () => {
    delete process.env.WHATSAPP_MODE;
    process.env.WHATSAPP_WORKER_URL = 'https://worker.example.test';
    process.env.WHATSAPP_WORKER_SECRET = 'secret';
    expect(remoteWhatsAppWorker.enabled()).toBe(false);
  });

  it('does not override an explicit local mode', () => {
    process.env.WHATSAPP_MODE = 'local_qr';
    process.env.WHATSAPP_WORKER_URL = 'https://worker.example.test';
    process.env.WHATSAPP_WORKER_SECRET = 'secret';
    expect(remoteWhatsAppWorker.enabled()).toBe(false);
  });

  it('rejects the legacy polling mode even when configured', () => {
    process.env.WHATSAPP_MODE = 'polling_worker';
    process.env.WHATSAPP_WORKER_URL = 'https://worker.example.test';
    process.env.WHATSAPP_WORKER_SECRET = 'secret';
    expect(remoteWhatsAppWorker.enabled()).toBe(false);
  });

  it('does not infer a transport in production', () => {
    delete process.env.WHATSAPP_MODE;
    delete process.env.WHATSAPP_WORKER_URL;
    delete process.env.WHATSAPP_WORKER_SECRET;
    Reflect.set(process.env, 'NODE_ENV', 'production');
    expect(remoteWhatsAppWorker.enabled()).toBe(false);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
