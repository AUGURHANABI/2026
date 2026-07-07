'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { fetchPermissions, PermissionsData } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface PermissionContextValue {
  permissions: PermissionsData | null;
  loading: boolean;
  hasPermission: (key: string) => boolean;
  refresh: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextValue>({
  permissions: null,
  loading: true,
  hasPermission: () => true, // default allow when not loaded
  refresh: async () => {},
});

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isLoading: authLoading, currentEnterpriseId } = useAuth();
  const lastFetchedEnterpriseId = useRef<string | null>(null);

  const loadPermissions = useCallback(async () => {
    try {
      const result = await fetchPermissions();
      setPermissions(result.data);
      // Track which enterprise we last fetched permissions for
      if (result.data) {
        const entId = typeof window !== 'undefined' ? localStorage.getItem('current_enterprise_id') : null;
        lastFetchedEnterpriseId.current = entId;
      }
    } catch {
      // Not logged in or no enterprise - set empty permissions
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load permissions on mount (may fail if enterprise ID not yet available)
  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Re-fetch when auth state changes AND enterprise ID is available
  // This is the critical fix: watch currentEnterpriseId so we re-fetch
  // as soon as the enterprise is loaded (not just on manual switch)
  useEffect(() => {
    if (!authLoading && user && currentEnterpriseId && currentEnterpriseId !== lastFetchedEnterpriseId.current) {
      loadPermissions();
    }
  }, [user, authLoading, currentEnterpriseId, loadPermissions]);

  // Listen for enterprise switch events (dispatched by sidebar or auth-context)
  useEffect(() => {
    const handleEnterpriseChange = () => {
      loadPermissions();
    };
    window.addEventListener('enterprise-changed', handleEnterpriseChange);
    return () => {
      window.removeEventListener('enterprise-changed', handleEnterpriseChange);
    };
  }, [loadPermissions]);

  const hasPermission = useCallback((key: string): boolean => {
    if (!permissions) return false;
    // Admins always have all permissions
    if (permissions.isAdmin) return true;
    return permissions.myPermissions.includes(key);
  }, [permissions]);

  return (
    <PermissionContext.Provider value={{ permissions, loading, hasPermission, refresh: loadPermissions }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}
