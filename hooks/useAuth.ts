import { useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

const ALLOWED_EMAIL = (import.meta.env.VITE_ALLOWED_EMAIL || '').trim();

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(() => {
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signOut = useCallback(() => {
    return supabase.auth.signOut();
  }, []);

  const isAuthorized = !!session && (
    !ALLOWED_EMAIL || user?.email === ALLOWED_EMAIL
  );

  return { session, user, loading, isAuthorized, signInWithGoogle, signOut };
}
