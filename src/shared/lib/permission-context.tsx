'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { fetchPermissions, PermissionsData } from '@/shared/lib/api';
import { useAuth } from '@/shared/lib/auth-context';

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
  const { user, isLoading: authLoading } = useAuth();

  const loadPermissions = useCallback(async () => {
    try {
      const result = await fetchPermissions();
      setPermissions(result.data);
    } catch {
      // Not logged in or no enterprise - set empty permissions
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load permissions on mount
  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  // Re-fetch when auth state changes (e.g. user logs in)
  useEffect(() => {
    if (!authLoading && user) {
      // Small delay to ensure localStorage has enterprise ID set by sidebar
      const timer = setTimeout(() => {
        loadPermissions();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [user, authLoading, loadPermissions]);

  // Listen for enterprise switch events (dispatched by sidebar)
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
