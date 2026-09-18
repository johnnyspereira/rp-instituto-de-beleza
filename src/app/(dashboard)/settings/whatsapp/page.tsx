import { redirect } from 'next/navigation';

export default function WhatsAppSettingsRedirect() {
  redirect('/settings?tab=whatsapp');
}
