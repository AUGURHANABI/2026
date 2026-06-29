'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSupabaseBrowserClientWithRetry } from '@/lib/supabase-browser';
import { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  enterpriseId: string | null;
  enterpriseName: string | null;
  enterpriseRole: string | null;
  setEnterprise: (id: string | null, name: string | null, role: string | null) => void;
  refreshEnterprise: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  enterpriseId: null,
  enterpriseName: null,
  enterpriseRole: null,
  setEnterprise: () => {},
  refreshEnterprise: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string | null>(null);
  const [enterpriseRole, setEnterpriseRole] = useState<string | null>(null);

  const setEnterprise = (id: string | null, name: string | null, role: string | null) => {
    setEnterpriseId(id);
    setEnterpriseName(name);
    setEnterpriseRole(role);
    if (id) {
      localStorage.setItem('current_enterprise_id', id);
      localStorage.setItem('current_enterprise_name', name || '');
      localStorage.setItem('current_enterprise_role', role || '');
    } else {
      localStorage.removeItem('current_enterprise_id');
      localStorage.removeItem('current_enterprise_name');
      localStorage.removeItem('current_enterprise_role');
    }
  };

  const refreshEnterprise = async () => {
    if (!user) {
      setEnterprise(null, null, null);
      return;
    }
    try {
      const res = await fetch('/api/enterprises/my');
      if (res.ok) {
        const data = await res.json();
        if (data.data && data.data.length > 0) {
          // Use saved selection or first enterprise
          const savedId = localStorage.getItem('current_enterprise_id');
          const found = data.data.find((e: { enterprise_id: string }) => e.enterprise_id === savedId);
          const target = found || data.data[0];
          setEnterprise(target.enterprise_id, target.enterprise_name, target.role);
        } else {
          setEnterprise(null, null, null);
        }
      }
    } catch {
      // Ignore errors
    }
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const supabase = await getSupabaseBrowserClientWithRetry();
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (currentSession) {
          setSession(currentSession);
          setUser(currentSession.user);
          // Restore enterprise selection
          const savedId = localStorage.getItem('current_enterprise_id');
          const savedName = localStorage.getItem('current_enterprise_name');
          const savedRole = localStorage.getItem('current_enterprise_role');
          if (savedId) {
            setEnterpriseId(savedId);
            setEnterpriseName(savedName);
            setEnterpriseRole(savedRole);
          }
          // Refresh enterprise in background
          refreshEnterprise();
        }
        setIsLoading(false);

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
          if (!mounted) return;
          setSession(newSession);
          setUser(newSession?.user ?? null);
          if (!newSession) {
            setEnterprise(null, null, null);
          }
        });

        return () => {
          subscription.unsubscribe();
        };
      } catch {
        if (mounted) setIsLoading(false);
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    try {
      const supabase = await getSupabaseBrowserClientWithRetry();
      await supabase.auth.signOut();
      setEnterprise(null, null, null);
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, enterpriseId, enterpriseName, enterpriseRole, setEnterprise, refreshEnterprise, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
