'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permission-context';
import { Sidebar } from '@/components/knowledge-base/sidebar';
import { KnowledgeList } from '@/components/knowledge-base/knowledge-list';
import { AIQA } from '@/components/knowledge-base/ai-qa';
import { CategoryManager } from '@/components/knowledge-base/category-manager';
import { TagManager } from '@/components/knowledge-base/tag-manager';
import { Statistics } from '@/components/knowledge-base/statistics';
import PermissionSettings from '@/components/knowledge-base/permission-settings';
import DeveloperDashboard from '@/components/knowledge-base/developer-dashboard';

type ActiveTab = 'knowledge' | 'qa' | 'categories' | 'tags' | 'statistics' | 'permissions' | 'developer';

const tabLabels: Record<ActiveTab, string> = {
  knowledge: '知识库',
  qa: 'AI 问答',
  categories: '分类管理',
  tags: '标签管理',
  statistics: '数据统计',
  permissions: '权限设置',
  developer: '开发者管理',
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('knowledge');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [licenseExpired, setLicenseExpired] = useState(false);
  const [licenseExpiryMsg, setLicenseExpiryMsg] = useState('');
  const { user, isLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  // Check license status
  useEffect(() => {
    const checkLicense = async () => {
      try {
        const enterpriseId = localStorage.getItem('current_enterprise_id');
        if (!enterpriseId) return;

        // Get session token from Supabase
        const { getSupabaseBrowserClientWithRetry } = await import('@/lib/supabase-browser');
        const supabase = await getSupabaseBrowserClientWithRetry();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;

        const checkRes = await fetch('/api/statistics?type=overview', {
          headers: {
            'x-session': token,
            'x-enterprise-id': enterpriseId,
          },
        });
        if (checkRes.status === 403) {
          const data = await checkRes.json();
          if (data.code === 'LICENSE_EXPIRED') {
            setLicenseExpired(true);
            setLicenseExpiryMsg(data.error || '企业授权已到期');
          }
        } else {
          setLicenseExpired(false);
        }
      } catch {
        // ignore
      }
    };
    if (user) checkLicense();
  }, [user]);

  // Close mobile menu on tab change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activeTab]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isAdmin = permissions?.isAdmin ?? false;
  const isDeveloperUser = permissions?.isDeveloper ?? false;

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isAdmin={isAdmin}
        isDeveloper={isDeveloperUser}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main content area */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 -ml-1 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="打开菜单"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h2 className="text-base font-semibold text-slate-800">{tabLabels[activeTab]}</h2>
        </header>

        {/* License expired banner */}
        {licenseExpired && activeTab !== 'developer' && (
          <div className="bg-red-50 border-b border-red-200 px-4 md:px-6 py-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm text-red-700 flex-1">{licenseExpiryMsg}</p>
              {isDeveloperUser && (
                <button
                  onClick={() => setActiveTab('developer')}
                  className="px-3 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 shrink-0"
                >
                  去续期
                </button>
              )}
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {activeTab === 'knowledge' && <KnowledgeList />}
          {activeTab === 'qa' && <AIQA />}
          {activeTab === 'categories' && <CategoryManager />}
          {activeTab === 'tags' && <TagManager />}
          {activeTab === 'statistics' && <Statistics />}
          {activeTab === 'permissions' && <PermissionSettings />}
          {activeTab === 'developer' && <DeveloperDashboard />}
        </main>
      </div>
    </div>
  );
}
