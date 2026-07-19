import { redirect } from 'next/navigation';

/** Signup always starts from the home page */
export default function SignupPage() {
  redirect('/?auth=signup#auth');
}
