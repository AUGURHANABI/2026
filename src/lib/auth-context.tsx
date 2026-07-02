'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { useSupabaseConfig } from './supabase-config-inject';

interface Enterprise {
  enterprise_id: string;
  enterprise_name: string;
  invite_code: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  enterprises: Enterprise[];
  currentEnterpriseId: string | null;
  setCurrentEnterpriseId: (id: string | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  enterprises: [],
  currentEnterpriseId: null,
  setCurrentEnterpriseId: () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { config } = useSupabaseConfig();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('current_enterprise_id');
    }
    return null;
  });

  // Step 1: Create Supabase client when config is ready
  useEffect(() => {
    if (!config?.url || !config?.anonKey) return;

    try {
      const client = createClient(config.url, config.anonKey, {
        db: { timeout: 60000 },
        auth: {
          autoRefreshToken: true,
          persistSession: true,
        },
      });
      setSupabase(client);
    } catch (err) {
      console.error('Failed to create Supabase client:', err);
      setIsLoading(false);
    }
  }, [config]);

  // Step 2: Once client is created, check session
  useEffect(() => {
    if (!supabase) return;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        loadEnterprises(currentSession.access_token);
      } else {
        setIsLoading(false);
      }
    }).catch((err) => {
      console.error('Failed to get session:', err);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          loadEnterprises(newSession.access_token);
        } else {
          setEnterprises([]);
          setCurrentEnterpriseId(null);
          setIsLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const loadEnterprises = async (token: string) => {
    try {
      const res = await fetch('/api/enterprises', {
        headers: { 'x-session': token },
      });
      if (res.ok) {
        const { data } = await res.json();
        setEnterprises(data || []);

        // Restore saved enterprise or use first one
        const savedId = localStorage.getItem('current_enterprise_id');
        if (savedId && data?.some((e: Enterprise) => e.enterprise_id === savedId)) {
          setCurrentEnterpriseId(savedId);
        } else if (data?.length > 0) {
          const firstId = data[0].enterprise_id;
          setCurrentEnterpriseId(firstId);
          localStorage.setItem('current_enterprise_id', firstId);
        }
      }
    } catch (err) {
      console.error('Failed to load enterprises:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    localStorage.removeItem('current_enterprise_id');
    setCurrentEnterpriseId(null);
    setEnterprises([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        enterprises,
        currentEnterpriseId,
        setCurrentEnterpriseId: (id: string | null) => {
          setCurrentEnterpriseId(id);
          if (id) localStorage.setItem('current_enterprise_id', id);
          else localStorage.removeItem('current_enterprise_id');
        },
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
