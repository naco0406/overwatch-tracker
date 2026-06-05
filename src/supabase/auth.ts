import { supabase } from '@/supabase/client';

interface SignInWithPasswordInput {
  email: string;
  password: string;
}

interface SignUpWithPasswordInput {
  email: string;
  password: string;
}

interface UpdatePasswordInput {
  currentPassword: string;
  password: string;
}

const getSession = () => supabase.auth.getSession();

const signInWithPassword = ({ email, password }: SignInWithPasswordInput) =>
  supabase.auth.signInWithPassword({ email, password });

const signUpWithPassword = ({ email, password }: SignUpWithPasswordInput) =>
  supabase.auth.signUp({ email, password });

const updatePassword = ({ currentPassword, password }: UpdatePasswordInput) =>
  supabase.auth.updateUser({
    current_password: currentPassword,
    password,
  });

const deleteCurrentUser = () => supabase.rpc('delete_current_user');

const signOut = () => supabase.auth.signOut();

const signOutLocally = () => supabase.auth.signOut({ scope: 'local' });

export {
  deleteCurrentUser,
  getSession,
  signInWithPassword,
  signOut,
  signOutLocally,
  signUpWithPassword,
  updatePassword,
};
