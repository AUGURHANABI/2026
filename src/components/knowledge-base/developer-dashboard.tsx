'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchDeveloperEnterprises,
  updateEnterpriseLicense,
  deleteEnterprise,
  fetchEnterpriseMembersById,
  removeEnterpriseMember,
  DeveloperEnterprise,
} from '@/lib/api';

interface Member {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  email: string;
}

export default function DeveloperDashboard() {
  const [enterprises, setEnterprises] = useState<DeveloperEnterprise[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // License edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editYears, setEditYears] = useState('1');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState('');

  // Member removal
  const [removingMember, setRemovingMember] = useState<{ enterpriseId: string; userId: string; email: string } | null>(null);

  const loadEnterprises = useCallback(async () => {
    try {
      const result = await fetchDeveloperEnterprises();
      setEnterprises(result.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEnterprises();
  }, [loadEnterprises]);

  const loadMembers = async (enterpriseId: string) => {
    setMembersLoading(true);
    try {
      const result = await fetchEnterpriseMembersById(enterpriseId);
      setMembers(result.data || []);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleExpand = (enterpriseId: string) => {
    if (expandedId === enterpriseId) {
      setExpandedId(null);
      setMembers([]);
    } else {
      setExpandedId(enterpriseId);
      loadMembers(enterpriseId);
    }
  };

  const handleEditLicense = (ent: DeveloperEnterprise) => {
    setEditingId(ent.id);
    setEditName(ent.name);
    // Calculate remaining years if there's an existing license
    if (ent.license_expires_at) {
      const expires = new Date(ent.license_expires_at);
      const now = new Date();
      const remainingMs = expires.getTime() - now.getTime();
      const remainingYears = remainingMs / (365.25 * 24 * 60 * 60 * 1000);
      setEditYears(remainingYears > 0 ? remainingYears.toFixed(1) : '0');
    } else {
      setEditYears('1');
    }
  };

  const handleSaveLicense = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const years = parseFloat(editYears);
      if (isNaN(years) || years < 0) {
        alert('请输入有效的年限');
        return;
      }

      await updateEnterpriseLicense(editingId, {
        license_years: years,
        name: editName.trim() || undefined,
      });

      setEditingId(null);
      await loadEnterprises();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setSaving(true);
    try {
      await deleteEnterprise(deletingId);
      setDeletingId(null);
      setDeletingName('');
      await loadEnterprises();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!removingMember) return;
    setSaving(true);
    try {
      await removeEnterpriseMember(removingMember.enterpriseId, removingMember.userId);
      setRemovingMember(null);
      if (expandedId === removingMember.enterpriseId) {
        loadMembers(removingMember.enterpriseId);
      }
      await loadEnterprises();
    } catch (err) {
      alert(err instanceof Error ? err.message : '移除失败');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '永久';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getDaysRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return Infinity;
    const expires = new Date(expiresAt);
    const now = new Date();
    return Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">开发者管理后台</h2>
          <p className="text-sm text-slate-500 mt-1">管理所有企业账户与授权信息</p>
        </div>
        <div className="flex gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-sm text-slate-600">
            共 {enterprises.length} 家企业
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-emerald-50 text-sm text-emerald-700">
            {enterprises.filter(e => !e.is_expired).length} 家有效
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-red-50 text-sm text-red-700">
            {enterprises.filter(e => e.is_expired).length} 家已过期
          </div>
        </div>
      </div>

      {/* Enterprise List */}
      <div className="space-y-3">
        {enterprises.length === 0 && (
          <div className="text-center py-12 text-slate-400">暂无企业数据</div>
        )}

        {enterprises.map((ent) => {
          const daysLeft = getDaysRemaining(ent.license_expires_at);
          const isExpanded = expandedId === ent.id;
          const isEditing = editingId === ent.id;

          return (
            <div
              key={ent.id}
              className={`rounded-xl border transition-shadow hover:shadow-md ${
                ent.is_expired ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'
              }`}
            >
              {/* Enterprise Header */}
              <div
                className="px-4 md:px-6 py-4 cursor-pointer"
                onClick={() => handleExpand(ent.id)}
              >
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-800 truncate">{ent.name}</h3>
                      {ent.is_expired ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          已过期
                        </span>
                      ) : daysLeft <= 30 ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          即将到期
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          有效
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                      <span>邀请码: <span className="font-mono font-bold text-slate-700">{ent.invite_code}</span></span>
                      <span>成员: {ent.member_count} 人</span>
                      <span>创建者: {ent.owner_email || '未知'}</span>
                      <span>创建于: {formatDate(ent.created_at)}</span>
                    </div>
                  </div>

                  {/* License info */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">授权期限</div>
                      <div className={`text-sm font-medium ${ent.is_expired ? 'text-red-600' : 'text-slate-700'}`}>
                        {formatDate(ent.license_started_at)} ~ {formatDate(ent.license_expires_at)}
                      </div>
                      {!ent.is_expired && ent.license_expires_at && (
                        <div className={`text-xs ${daysLeft <= 30 ? 'text-amber-600' : 'text-slate-400'}`}>
                          剩余 {daysLeft} 天
                        </div>
                      )}
                      {!ent.license_expires_at && (
                        <div className="text-xs text-emerald-600">永久授权</div>
                      )}
                    </div>

                    {/* Expand arrow */}
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-slate-100 px-4 md:px-6 py-4 space-y-4">
                  {/* License Edit */}
                  {isEditing ? (
                    <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-slate-700">编辑授权</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">企业名称</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">授权年限（从当前起）</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={editYears}
                              onChange={(e) => setEditYears(e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                            <span className="flex items-center text-sm text-slate-500">年</span>
                          </div>
                          <div className="flex gap-1.5 mt-2">
                            {[
                              { label: '0.5年', value: '0.5' },
                              { label: '1年', value: '1' },
                              { label: '2年', value: '2' },
                              { label: '3年', value: '3' },
                              { label: '5年', value: '5' },
                              { label: '永久', value: '999' },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => setEditYears(opt.value)}
                                className={`px-2 py-1 text-xs rounded border transition-colors ${
                                  editYears === opt.value
                                    ? 'bg-cyan-600 text-white border-cyan-600'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-300'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleSaveLicense}
                          disabled={saving}
                          className="px-4 py-2 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
                        >
                          {saving ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleEditLicense(ent)}
                        className="px-3 py-1.5 text-sm bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
                      >
                        编辑授权
                      </button>
                      <button
                        onClick={() => {
                          setDeletingId(ent.id);
                          setDeletingName(ent.name);
                        }}
                        className="px-3 py-1.5 text-sm bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        删除企业
                      </button>
                    </div>
                  )}

                  {/* Members List */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-2">企业成员</h4>
                    {membersLoading ? (
                      <div className="text-sm text-slate-400 py-2">加载中...</div>
                    ) : members.length === 0 ? (
                      <div className="text-sm text-slate-400 py-2">暂无成员</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100">
                              <th className="text-left py-2 pr-4 text-slate-500 font-medium">邮箱</th>
                              <th className="text-left py-2 pr-4 text-slate-500 font-medium">角色</th>
                              <th className="text-left py-2 pr-4 text-slate-500 font-medium">加入时间</th>
                              <th className="text-right py-2 text-slate-500 font-medium">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.map((m) => (
                              <tr key={m.id} className="border-b border-slate-50">
                                <td className="py-2 pr-4 text-slate-700">{m.email}</td>
                                <td className="py-2 pr-4">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    m.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                                    m.role === 'admin' ? 'bg-cyan-100 text-cyan-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {m.role === 'owner' ? '创建者' : m.role === 'admin' ? '管理员' : '成员'}
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-slate-500">{formatDate(m.joined_at)}</td>
                                <td className="py-2 text-right">
                                  {m.role !== 'owner' && (
                                    <button
                                      onClick={() => setRemovingMember({
                                        enterpriseId: ent.id,
                                        userId: m.user_id,
                                        email: m.email,
                                      })}
                                      className="text-xs text-red-500 hover:text-red-700"
                                    >
                                      移除
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">确认删除企业</h3>
            <p className="text-sm text-slate-500 mb-4">
              确定要删除企业「{deletingName}」吗？此操作不可恢复，所有数据将被永久删除。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setDeletingId(null); setDeletingName(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Dialog */}
      {removingMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">确认移除成员</h3>
            <p className="text-sm text-slate-500 mb-4">
              确定要将「{removingMember.email}」从企业中移除吗？
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRemovingMember(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                取消
              </button>
              <button
                onClick={handleRemoveMember}
                disabled={saving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? '移除中...' : '确认移除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
