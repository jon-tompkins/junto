import { redirect } from 'next/navigation';

// Signal is the default experience; its landing lives at the apex now. Keep this
// path alive (it was briefly the landing during the splash experiment) → redirect home.
export default function SignalRedirect() {
  redirect('/');
}
