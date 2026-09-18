import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent');
    const { data, error } = await supabase.from('clinic_appointment_reviews')
      .select('id,rating,comment,consent_to_publish,published_at,sent_at,submitted_at,appointment:clinic_appointments(scheduled_start,service:clinic_services(name)),contact:contacts(name)')
      .eq('account_id', accountId).not('submitted_at','is',null).order('submitted_at',{ascending:false}).limit(100);
    if (error) throw error;
    return NextResponse.json({ reviews: data ?? [] });
  } catch (error) { return toErrorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const body = await request.json();
    const published = body?.published === true;
    if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Avaliação inválida.' }, { status: 400 });
    const { error } = await supabase.from('clinic_appointment_reviews').update({ published_at: published ? new Date().toISOString() : null }).eq('id',body.id).eq('account_id',accountId).eq('consent_to_publish',true);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return toErrorResponse(error); }
}
