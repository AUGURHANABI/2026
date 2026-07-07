'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePermissions } from '@/lib/permission-context';
import {
  PermissionsData,
  PermissionDefinition,
  MemberOverride,
  updateRolePermissions,
  updateMemberPermissions,
  resetMemberPermissions,
  fetchEnterpriseMembers,
  EnterpriseMember,
  updateMemberRole,
} from '@/lib/api';

const ALL_PERMISSIONS: PermissionDefinition[] = [
  { key: 'entry:create', label: '新增话术', category: '话术管理' },
  { key: 'entry:edit', label: '编辑话术', category: '话术管理' },
  { key: 'entry:delete', label: '删除话术', category: '话术管理' },
  { key: 'entry:import', label: '导入话术', category: '话术管理' },
  { key: 'category:manage', label: '管理分类', category: '分类标签' },
  { key: 'tag:manage', label: '管理标签', category: '分类标签' },
  { key: 'comment:delete', label: '删除评论', category: '评论管理' },
  { key: 'comment:merge', label: '合并评论到答案', category: '评论管理' },
  { key: 'quotation:create', label: '新增报价', category: '产品报价' },
  { key: 'quotation:edit', label: '编辑报价', category: '产品报价' },
  { key: 'quotation:delete', label: '删除报价', category: '产品报价' },
  { key: 'quotation:import', label: '导入报价', category: '产品报价' },
  { key: 'quotation:export', label: '导出报价', category: '产品报价' },
  { key: 'entry:rate', label: '效果评分', category: '其他' },
  { key: 'qa:ask', label: 'AI问答', category: '其他' },
];

const CATEGORIES = [...new Set(ALL_PERMISSIONS.map(p => p.category))];

const ROLE_LABELS: Record<string, string> = {
  owner: '创建者',
  admin: '管理员',
  member: '普通成员',
};

export default function PermissionSettings() {
  const { permissions, refresh } = usePermissions();
  const [defaultMemberPerms, setDefaultMemberPerms] = useState<string[]>([]);
  const [memberOverrides, setMemberOverrides] = useState<MemberOverride[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'permissions' | 'members'>('permissions');
  const [members, setMembers] = useState<EnterpriseMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Record<string, string[]>>({});
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);

  // Initialize from fetched data
  useEffect(() => {
    if (permissions?.permissionsByRole?.member) {
      setDefaultMemberPerms(permissions.permissionsByRole.member);
    }
    if (permissions?.memberOverrides) {
      setMemberOverrides(permissions.memberOverrides);
      // Initialize editing state from overrides
      const editState: Record<string, string[]> = {};
      for (const o of permissions.memberOverrides) {
        editState[o.user_id] = o.permissions;
      }
      setEditingPerms(editState);
    }
  }, [permissions]);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const result = await fetchEnterpriseMembers();
      setMembers(result.data);
      setCurrentUserId(result.currentUserId);
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'members' && permissions?.isAdmin) {
      loadMembers();
    }
  }, [activeTab, permissions?.isAdmin, loadMembers]);

  // Default role permissions
  const handleToggleDefaultPerm = (key: string) => {
    setDefaultMemberPerms(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSaveDefaultPerms = async () => {
    setSaving(true);
    try {
      await updateRolePermissions('member', defaultMemberPerms);
      await refresh();
      alert('默认权限保存成功');
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  // Per-member permissions
  const handleToggleMemberPerm = (userId: string, key: string) => {
    setEditingPerms(prev => {
      const current = prev[userId] || [...defaultMemberPerms];
      const updated = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
      return { ...prev, [userId]: updated };
    });
  };

  const handleSaveMemberPerms = async (userId: string) => {
    setSavingMemberId(userId);
    try {
      const perms = editingPerms[userId] || [];
      await updateMemberPermissions(userId, perms);
      await refresh();
      setMemberOverrides(prev => {
        const exists = prev.find(o => o.user_id === userId);
        if (exists) {
          return prev.map(o => o.user_id === userId ? { ...o, permissions: perms } : o);
        }
        return [...prev, { user_id: userId, permissions: perms }];
      });
      alert('成员权限保存成功');
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleResetMemberPerms = async (userId: string) => {
    if (!confirm('确定要将该成员权限重置为默认？')) return;
    setSavingMemberId(userId);
    try {
      await resetMemberPermissions(userId);
      await refresh();
      setMemberOverrides(prev => prev.filter(o => o.user_id !== userId));
      setEditingPerms(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      alert('已重置为默认权限');
    } catch (err) {
      alert(`重置失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSavingMemberId(null);
    }
  };

  // Role change
  const handleRoleChange = async (memberId: string, newRole: string) => {
    setUpdatingMemberId(memberId);
    try {
      await updateMemberRole(memberId, newRole);
      setMembers(prev =>
        prev.map(m => (m.id === memberId ? { ...m, role: newRole } : m))
      );
      await refresh();
    } catch (err) {
      alert(`更新角色失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const getMemberEmail = (userId: string) => {
    const member = members.find(m => m.user_id === userId);
    return member?.user_email || userId.slice(0, 12) + '...';
  };

  const hasCustomPerms = (userId: string) => {
    return memberOverrides.some(o => o.user_id === userId);
  };

  const getEffectivePerms = (userId: string): string[] => {
    if (editingPerms[userId]) return editingPerms[userId];
    const override = memberOverrides.find(o => o.user_id === userId);
    if (override) return override.permissions;
    return defaultMemberPerms;
  };

  if (!permissions?.isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        仅管理员可访问此页面
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'permissions'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('permissions')}
        >
          默认权限
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'members'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('members')}
        >
          成员权限
        </button>
      </div>

      {/* Default Permissions Tab */}
      {activeTab === 'permissions' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-base font-semibold mb-1">普通成员默认权限</h3>
            <p className="text-sm text-muted-foreground mb-4">
              管理员默认拥有所有权限。以下设置是新加入普通成员的默认权限，也可在「成员权限」中为特定成员单独配置。
            </p>

            {CATEGORIES.map(category => (
              <div key={category} className="mb-5 last:mb-0">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">{category}</h4>
                <div className="space-y-2">
                  {ALL_PERMISSIONS.filter(p => p.category === category).map(perm => (
                    <label
                      key={perm.key}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={defaultMemberPerms.includes(perm.key)}
                        onChange={() => handleToggleDefaultPerm(perm.key)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                      />
                      <span className="text-sm">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleSaveDefaultPerms}
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : '保存默认权限'}
          </button>
        </div>
      )}

      {/* Member Permissions Tab */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">成员权限管理</h3>
            <p className="text-xs text-muted-foreground">点击成员展开配置个人权限</p>
          </div>

          {loadingMembers ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">暂无成员</div>
          ) : (
            <div className="space-y-2">
              {members.map(member => {
                const isAdminOrOwner = member.role === 'owner' || member.role === 'admin';
                const isExpanded = expandedMemberId === member.user_id;
                const isCustom = hasCustomPerms(member.user_id);
                const effectivePerms = getEffectivePerms(member.user_id);

                return (
                  <div key={member.id} className="rounded-lg border border-border bg-card overflow-hidden">
                    {/* Member header row */}
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => {
                        if (isAdminOrOwner) return;
                        setExpandedMemberId(isExpanded ? null : member.user_id);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                          {(member.user_email || member.user_id).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium flex items-center gap-2">
                            {member.user_email || member.user_id.slice(0, 12) + '...'}
                            {member.user_id === currentUserId && (
                              <span className="text-xs text-muted-foreground">(你)</span>
                            )}
                            {isCustom && !isAdminOrOwner && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                自定义
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            加入于 {new Date(member.joined_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {member.role === 'owner' ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground">
                            创建者
                          </span>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleRoleChange(member.id, e.target.value);
                            }}
                            disabled={updatingMemberId === member.id}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm rounded-md border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
                          >
                            <option value="admin">管理员</option>
                            <option value="member">普通成员</option>
                          </select>
                        )}
                        {!isAdminOrOwner && (
                          <svg
                            className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Expanded permission editor */}
                    {isExpanded && !isAdminOrOwner && (
                      <div className="border-t border-border bg-muted/20 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-muted-foreground">
                            个人权限配置
                          </div>
                          {isCustom && (
                            <button
                              onClick={() => handleResetMemberPerms(member.user_id)}
                              disabled={savingMemberId === member.user_id}
                              className="text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
                            >
                              重置为默认
                            </button>
                          )}
                        </div>

                        {CATEGORIES.map(category => (
                          <div key={category} className="mb-4 last:mb-0">
                            <h5 className="text-xs font-medium text-muted-foreground mb-1.5">{category}</h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                              {ALL_PERMISSIONS.filter(p => p.category === category).map(perm => (
                                <label
                                  key={perm.key}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={effectivePerms.includes(perm.key)}
                                    onChange={() => handleToggleMemberPerm(member.user_id, perm.key)}
                                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/30"
                                  />
                                  <span className="text-xs">{perm.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}

                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                          <button
                            onClick={() => handleSaveMemberPerms(member.user_id)}
                            disabled={savingMemberId === member.user_id}
                            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                          >
                            {savingMemberId === member.user_id ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={() => setExpandedMemberId(null)}
                            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
