import { useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { clearUserScopedClientState } from '@/lib/clientSessionState';
import {
  deleteCurrentUser,
  getSession,
  signInWithPassword,
  signOutLocally,
  signOut as signOutRequest,
  signUpWithPassword,
  updatePassword as updatePasswordRequest,
} from '@/supabase/auth';
import { supabase } from '@/supabase/client';

interface AuthContextValue {
  deleteAccount: () => Promise<void>;
  isLoading: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  updatePassword: (currentPassword: string, password: string) => Promise<void>;
  user: User | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

const AuthProvider = ({ children }: AuthProviderProps) => {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const userIdRef = useRef<string | null>(null);

  const clearClientSessionState = useCallback(() => {
    clearUserScopedClientState();
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  const applySession = useCallback(
    (nextSession: Session | null) => {
      const previousUserId = userIdRef.current;
      const nextUserId = nextSession?.user.id ?? null;
      const didSignOut = previousUserId !== null && nextUserId === null;
      const didSwitchUser =
        previousUserId !== null && nextUserId !== null && previousUserId !== nextUserId;

      if (didSignOut || didSwitchUser) {
        clearClientSessionState();
      }

      userIdRef.current = nextUserId;
      setSession(nextSession);
      setIsLoading(false);
    },
    [clearClientSessionState],
  );

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const {
        data: { session: currentSession },
        error,
      } = await getSession();

      if (!isMounted) {
        return;
      }

      applySession(error ? null : currentSession);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    void loadSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await signInWithPassword({ email, password });

    if (error) {
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await signOutRequest();

    if (error) {
      throw error;
    }

    clearClientSessionState();
    userIdRef.current = null;
    setSession(null);
  }, [clearClientSessionState]);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await signUpWithPassword({ email, password });

    if (error) {
      throw error;
    }
  }, []);

  const updatePassword = useCallback(async (currentPassword: string, password: string) => {
    const { error } = await updatePasswordRequest({ currentPassword, password });

    if (error) {
      throw error;
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    const { error } = await deleteCurrentUser();

    if (error) {
      throw error;
    }

    const { error: signOutError } = await signOutLocally();

    if (signOutError) {
      throw signOutError;
    }

    clearClientSessionState();
    userIdRef.current = null;
    setSession(null);
  }, [clearClientSessionState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      deleteAccount,
      isLoading,
      session,
      signIn,
      signOut,
      signUp,
      updatePassword,
      user: session?.user ?? null,
    }),
    [deleteAccount, isLoading, session, signIn, signOut, signUp, updatePassword],
  );

  return (
    <AuthContext.Provider key={session?.user.id ?? 'signed-out'} value={value}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
};

export { AuthProvider, useAuth };
