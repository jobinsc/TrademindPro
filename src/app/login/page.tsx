import { redirect } from 'next/navigation';

/** Login always starts from the home page */
export default function LoginPage() {
  redirect('/?auth=login#auth');
}
