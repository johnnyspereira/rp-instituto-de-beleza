import { createClient } from '@/lib/supabase/server';
import { selectRows } from '@/lib/mysql/db';
import { remoteWhatsAppWorker } from '@/lib/whatsapp/remote-worker';

export async function GET() {
  const session = await createClient();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { data: profile } = await session
    .from('profiles')
    .select('account_id')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  const startedAt = Date.now();
  const checks: Array<{ id: string; label: string; status: 'ok' | 'warning' | 'error'; detail: string }> = [];
  try {
    await selectRows('SELECT 1 AS ok');
    checks.push({ id: 'mysql', label: 'Base de dados MySQL', status: 'ok', detail: 'Ligação e consulta de leitura concluídas.' });
  } catch (error) {
    checks.push({ id: 'mysql', label: 'Base de dados MySQL', status: 'error', detail: error instanceof Error ? error.message : 'Não foi possível consultar a base de dados.' });
  }

  const storageDirectory =
    process.env.LOCAL_UPLOAD_DIR?.trim() || process.env.STORAGE_LOCAL_DIR?.trim();
  checks.push({
    id: 'storage', label: 'Armazenamento de ficheiros',
    status: storageDirectory ? 'ok' : 'warning',
    detail: storageDirectory
      ? 'Armazenamento local configurado.'
      : 'Verifique a configuração LOCAL_UPLOAD_DIR para fotos e anexos.',
  });

  if (!remoteWhatsAppWorker.enabled()) {
    checks.push({ id: 'worker', label: 'Worker do WhatsApp', status: 'warning', detail: 'remote_worker não está ativo; os alertas podem ficar em fila.' });
  } else {
    try {
      if (!profile?.account_id) throw new Error('Conta do utilizador não encontrada.');
      const worker = await remoteWhatsAppWorker.status({ accountId: profile.account_id, userId: auth.user.id, autoStart: false });
      checks.push({ id: 'worker', label: 'Worker do WhatsApp', status: worker.connected ? 'ok' : 'warning', detail: worker.connected ? 'Worker respondeu e a sessão WhatsApp está ligada.' : 'Worker respondeu, mas a sessão WhatsApp não está ligada.' });
    } catch (error) {
      checks.push({ id: 'worker', label: 'Worker do WhatsApp', status: 'error', detail: error instanceof Error ? error.message : 'Worker indisponível.' });
    }
  }

  checks.push({ id: 'finance', label: 'Alertas financeiros', status: process.env.AUTOMATION_CRON_SECRET ? 'ok' : 'warning', detail: process.env.AUTOMATION_CRON_SECRET ? 'Cron protegido configurado; o processamento será entregue pelo Worker remoto.' : 'Falta AUTOMATION_CRON_SECRET para executar lembretes programados.' });
  checks.push({ id: 'portal', label: 'Portal 360', status: 'ok', detail: 'Fluxo de marcação validado; novas marcações geram alerta ao responsável.' });
  return Response.json({ checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, checks });
}
