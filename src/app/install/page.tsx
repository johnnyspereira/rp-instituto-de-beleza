import { redirect } from 'next/navigation';

// Installation is a one-time provisioning operation. It must never be exposed
// on the live business domain, nor run a database query just to render a page.
export default function InstallPage() {
  redirect('/login');
}
