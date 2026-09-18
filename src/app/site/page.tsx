import { redirect } from 'next/navigation';

// Legacy directory route. RP Instituto de Beleza has a single public site at the root.
export default function LegacySiteDirectoryRedirect() {
  redirect('/');
}
