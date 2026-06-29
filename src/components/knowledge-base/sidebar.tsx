'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useEffect } from 'react';

interface Enterprise {
  id: string;
  name: string;
  invite_code: string;
  role: 'owner' | 'admin' | 'member';
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: 'knowledge' | 'qa' | 'categories' | 'tags' | 'statistics') => void;
}

const navItems = [
  { id: 'knowledge' as const, label: '知识库', icon: '📚' },
  { id: 'qa' as const, label: 'AI 问答', icon: '💬' },
  { id: 'categories' as const, label: '分类管理', icon: '📂' },
  { id: 'tags' as const, label: '标签管理', icon: '🏷️' },
  { id: 'statistics' as const, label: '数据统计', icon: '📊' },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { user, session, signOut } = useAuth();
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [currentEnterprise, setCurrentEnterprise] = useState<Enterprise | null>(null);
  const [showEnterpriseDropdown, setShowEnterpriseDropdown] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [newEnterpriseName, setNewEnterpriseName] = useState('');
  const [loading, setLoading] = useState(false);

  const token = session?.access_token ?? '';

  useEffect(() => {
    if (token) {
      loadEnterprises();
    }
  }, [token]);

  const loadEnterprises = async () => {
    try {
      const res = await fetch('/api/enterprises', {
        headers: token ? { 'x-session': token } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const ents = (data.data ?? []) as Enterprise[];
        setEnterprises(ents);
        // Load current enterprise from localStorage
        const savedId = localStorage.getItem('current_enterprise_id');
        const found = ents.find((e) => e.id === savedId);
        setCurrentEnterprise(found || ents[0] || null);
        if (found || ents[0]) {
          localStorage.setItem('current_enterprise_id', (found || ents[0]).id);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleSwitchEnterprise = (ent: Enterprise) => {
    setCurrentEnterprise(ent);
    localStorage.setItem('current_enterprise_id', ent.id);
    setShowEnterpriseDropdown(false);
    // Reload page to refresh data with new enterprise context
    window.location.reload();
  };

  const handleJoinEnterprise = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/enterprises/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session': token },
        body: JSON.stringify({ invite_code: joinCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowJoinDialog(false);
        setJoinCode('');
        await loadEnterprises();
        // Switch to the newly joined enterprise
        if (data.data?.enterprise) {
          handleSwitchEnterprise(data.data.enterprise);
        }
      } else {
        alert(data.error || '加入企业失败');
      }
    } catch {
      alert('加入企业失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEnterprise = async () => {
    if (!newEnterpriseName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/enterprises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session': token },
        body: JSON.stringify({ name: newEnterpriseName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateDialog(false);
        setNewEnterpriseName('');
        await loadEnterprises();
        if (data.data?.id) {
          handleSwitchEnterprise(data.data);
        }
      } else {
        alert(data.error || '创建企业失败');
      }
    } catch {
      alert('创建企业失败');
    } finally {
      setLoading(false);
    }
  };

  const userEmail = user?.email ?? '';
  const userInitial = userEmail.charAt(0).toUpperCase() || 'U';

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#1e293b] text-white flex flex-col">
      <div className="px-6 py-5 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">询盘话术知识库</h1>
        <p className="text-xs text-slate-400 mt-1">AI 驱动 · 专业高效</p>
      </div>

      {/* Enterprise selector */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="relative">
          <button
            onClick={() => setShowEnterpriseDropdown(!showEnterpriseDropdown)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm"
          >
            <span className="truncate">
              {currentEnterprise ? currentEnterprise.name : '未加入企业'}
            </span>
            <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showEnterpriseDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
              {enterprises.map((ent) => (
                <button
                  key={ent.id}
                  onClick={() => handleSwitchEnterprise(ent)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                    currentEnterprise?.id === ent.id ? 'text-cyan-400' : 'text-slate-200'
                  }`}
                >
                  <span className="truncate block">{ent.name}</span>
                  {ent.role === 'owner' && (
                    <span className="text-[10px] text-amber-400">创建者</span>
                  )}
                </button>
              ))}

              <div className="border-t border-white/10">
                <button
                  onClick={() => { setShowJoinDialog(true); setShowEnterpriseDropdown(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-cyan-400 hover:bg-white/10"
                >
                  + 加入企业
                </button>
                <button
                  onClick={() => { setShowCreateDialog(true); setShowEnterpriseDropdown(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-cyan-400 hover:bg-white/10"
                >
                  + 创建企业
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
              activeTab === item.id
                ? 'bg-cyan-600/20 text-cyan-400 border-r-2 border-cyan-400'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* User info and logout */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-sm font-bold">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{userEmail}</p>
          </div>
          <button
            onClick={signOut}
            className="text-slate-400 hover:text-white transition-colors"
            title="退出登录"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-6 py-3 border-t border-white/10">
        <p className="text-xs text-slate-500">v1.0.0</p>
      </div>

      {/* Join Enterprise Dialog */}
      {showJoinDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">加入企业</h3>
            <p className="text-sm text-slate-500 mb-3">输入企业邀请码，加入您的团队</p>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="请输入邀请码"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleJoinEnterprise()}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowJoinDialog(false); setJoinCode(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                取消
              </button>
              <button
                onClick={handleJoinEnterprise}
                disabled={loading || !joinCode.trim()}
                className="px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
              >
                {loading ? '加入中...' : '加入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Enterprise Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">创建企业</h3>
            <p className="text-sm text-slate-500 mb-3">创建企业后，您可以邀请团队成员加入</p>
            <input
              type="text"
              value={newEnterpriseName}
              onChange={(e) => setNewEnterpriseName(e.target.value)}
              placeholder="请输入企业名称"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateEnterprise()}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowCreateDialog(false); setNewEnterpriseName(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                取消
              </button>
              <button
                onClick={handleCreateEnterprise}
                disabled={loading || !newEnterpriseName.trim()}
                className="px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
              >
                {loading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
