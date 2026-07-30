import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AuthSession } from '@supabase/supabase-js';
import { Profile } from '../types';

interface AuthContextValue {
  session: AuthSession | null;
  profile: Profile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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
          if (cleared) {
            window.location.reload();
          } else if ((event as string) === 'TOKEN_REFRESH_FAILED') {
            window.location.href = '/';
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
    <AuthContext.Provider value={{ session, profile, loading }}>
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
