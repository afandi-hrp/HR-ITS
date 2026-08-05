import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AuthSession } from '@supabase/supabase-js';
import { Profile } from '../types';
import { useToast } from '../components/ui/Toaster';

interface AuthContextValue {
  session: AuthSession | null;
  profile: Profile | null;
  loading: boolean;
  // Lets an open form/modal with unsaved input (e.g. the candidate
  // evaluation form) tell AuthProvider to hold off on reacting to a
  // session hiccup until the form is closed/saved — see usage below.
  setSessionProtected: (active: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  // A ref (not state) so the onAuthStateChange closure registered below
  // (inside a [] effect) always reads the latest value without needing to
  // re-subscribe.
  const sessionProtectedRef = useRef(false);
  const setSessionProtected = useCallback((active: boolean) => {
    sessionProtectedRef.current = active;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('Session error:', error.message);
        if (error.message.includes('Refresh Token Not Found') || error.message.includes('Invalid Refresh Token') || error.message.includes('refresh_token_not_found') || error.message.includes('Auth session missing')) {
          supabase.auth.signOut().catch(() => {});
          // Clear supabase auth tokens from local storage
          let cleared = false;
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.includes('auth-token')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            cleared = true;
          });
          if (cleared) {
            window.location.reload();
          } else {
            // Force location reload even if we didn't find the exact key, to ensure clean state
            window.location.href = '/';
          }
        }
      }
      setSession(session);
      if (session?.user) {
        const fetchProfile1 = async () => {
          try {
            const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
            setProfile(data);
            setLoading(false);
          } catch (err) {
            console.warn('Failed to load profile (1):', err);
            setLoading(false);
          }
        };
        fetchProfile1();
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.warn('Failed to get session:', err);
      setSession(null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event as string) === 'SIGNED_OUT' || (event as string) === 'TOKEN_REFRESH_FAILED') {
        // TOKEN_REFRESH_FAILED can be a false alarm — e.g. another tab of
        // this same app already rotated the refresh token first — rather
        // than a genuinely dead session. Re-check before nuking anything;
        // otherwise simply switching back to this tab after opening an
        // external link (LinkedIn, Instagram, etc.) triggers a jarring full
        // page reload even though the session is still perfectly valid.
        supabase.auth.getSession().then(({ data: { session: recheckedSession } }) => {
          if (recheckedSession) {
            setSession(recheckedSession);
            return;
          }

          // Unsaved work is open (e.g. mid-fill on the evaluation form) —
          // don't touch anything: no clearing, no toast, no redirect to
          // Login. This event is very often just a false alarm from
          // Supabase's visibility-triggered refresh check (switching
          // tabs/apps is exactly when it re-checks the session), and
          // interrupting the user mid-entry was the problem being fixed
          // here. If the session really is dead, that surfaces later and
          // less disruptively — e.g. as a "failed to save" error — once
          // they finish and the protection is lifted.
          if (sessionProtectedRef.current) {
            return;
          }

          let cleared = false;
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.includes('auth-token')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            cleared = true;
          });
          setSession(null);
          setProfile(null);

          // Previously this called window.location.reload() / redirected
          // via window.location.href here, which wipes any unsaved work in
          // an open form/modal (e.g. an in-progress candidate evaluation)
          // the instant the session dies mid-use — and this branch is
          // commonly reached just from switching browser tabs, since
          // tab-visibility changes are exactly when Supabase re-checks/
          // refreshes the session. setSession(null) above already makes
          // App.tsx render the Login screen via a normal React re-render —
          // no hard navigation needed, so state elsewhere on the page that
          // the user hasn't explicitly saved yet is no longer discarded.
          if (cleared || (event as string) === 'TOKEN_REFRESH_FAILED') {
            toast({
              title: 'Sesi Login Berakhir',
              description: 'Sesi Anda telah berakhir dan perlu login kembali. Jika ada isian yang belum disimpan, mungkin perlu diisi ulang.',
              variant: 'destructive',
            });
          }
        });
        return;
      }
      setSession(session);
      if (session?.user) {
        const fetchProfile2 = async () => {
          try {
            const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
            setProfile(data);
          } catch (err) {
            console.warn('Failed to load profile (2):', err);
          }
        };
        fetchProfile2();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, setSessionProtected }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
