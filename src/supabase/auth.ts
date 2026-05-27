import { supabase } from '@/supabase/client';

interface SignInWithPasswordInput {
  email: string;
  password: string;
}

interface SignUpWithPasswordInput {
  email: string;
  password: string;
}

const getSession = () => supabase.auth.getSession();

const signInWithPassword = ({ email, password }: SignInWithPasswordInput) =>
  supabase.auth.signInWithPassword({ email, password });

const signUpWithPassword = ({ email, password }: SignUpWithPasswordInput) =>
  supabase.auth.signUp({ email, password });

const signOut = () => supabase.auth.signOut();

export { getSession, signInWithPassword, signOut, signUpWithPassword };
