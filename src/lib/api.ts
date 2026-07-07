const API_BASE = '/api';

/** Get session token from auth-context's session promise */
export async function getSessionToken(): Promise<string | null> {
  try {
    const { waitForSessionToken } = await import('@/lib/auth-context');
    return await waitForSessionToken();
  } catch {
    return null;
  }
}

/** Reset session promise (call this after login/logout) */
export function resetSessionPromise() {
  // Session is now managed by auth-context, this is just a placeholder for compatibility
}

/** Get current enterprise ID from localStorage */
function getCurrentEnterpriseId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('current_enterprise_id');
}

/** Fetch wrapper that automatically attaches x-session and x-enterprise-id headers */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getSessionToken();
  const enterpriseId = getCurrentEnterpriseId();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('x-session', token);
  }
  if (enterpriseId) {
    headers.set('x-enterprise-id', enterpriseId);
  }
  // GET 请求显式禁用缓存，避免移动端浏览器命中启发式缓存返回旧数据
  const method = (options.method || 'GET').toUpperCase();
  const cache = method === 'GET' ? 'no-store' : options.cache;
  return fetch(url, { ...options, headers, cache });
}

export async function fetchCategories() {
  const res = await authFetch(`${API_BASE}/categories`);
  if (!res.ok) throw new Error('获取分类失败');
  return res.json();
}

export async function createCategory(data: { name: string; description?: string; sort_order?: number }) {
  const res = await authFetch(`${API_BASE}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '创建分类失败');
  }
  return res.json();
}

export async function updateCategory(id: string, data: { name?: string; description?: string; sort_order?: number }) {
  const res = await authFetch(`${API_BASE}/categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '更新分类失败');
  }
  return res.json();
}

export async function deleteCategory(id: string) {
  const res = await authFetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '删除分类失败');
  }
  return res.json();
}

export async function fetchTags() {
  const res = await authFetch(`${API_BASE}/tags`);
  if (!res.ok) throw new Error('获取标签失败');
  return res.json();
}

export async function createTag(data: { name: string; color?: string }) {
  const res = await authFetch(`${API_BASE}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '创建标签失败');
  }
  return res.json();
}

export async function updateTag(id: string, data: { name?: string; color?: string }) {
  const res = await authFetch(`${API_BASE}/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '更新标签失败');
  }
  return res.json();
}

export async function deleteTag(id: string) {
  const res = await authFetch(`${API_BASE}/tags/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '删除标签失败');
  }
  return res.json();
}

export async function fetchKnowledge(params?: {
  category_id?: string | null;
  tag_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
  is_active?: boolean;
}) {
  const searchParams = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    });
  }
  const res = await authFetch(`${API_BASE}/knowledge?${searchParams.toString()}`);
  if (!res.ok) throw new Error('获取知识库失败');
  return res.json();
}

export async function fetchKnowledgeById(id: string) {
  const res = await authFetch(`${API_BASE}/knowledge/${id}`);
  if (!res.ok) throw new Error('获取条目详情失败');
  return res.json();
}

export async function createKnowledge(data: {
  question: string;
  answer: string;
  category_id?: string | null;
  tag_ids?: string[];
}) {
  const res = await authFetch(`${API_BASE}/knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '创建条目失败');
  }
  return res.json();
}

export async function updateKnowledge(id: string, data: {
  question?: string;
  answer?: string;
  category_id?: string | null;
  tag_ids?: string[];
  is_active?: boolean;
  change_note?: string;
  effectiveness_score?: number;
}) {
  const res = await authFetch(`${API_BASE}/knowledge/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '更新条目失败');
  }
  return res.json();
}

export async function deleteKnowledge(id: string) {
  const res = await authFetch(`${API_BASE}/knowledge/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '删除条目失败');
  }
  return res.json();
}

export async function batchDeleteKnowledge(ids: string[]) {
  const res = await authFetch(`${API_BASE}/knowledge`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '批量删除失败');
  }
  return res.json();
}

export async function fetchEntryVersions(id: string) {
  const res = await authFetch(`${API_BASE}/knowledge/${id}/versions`);
  if (!res.ok) throw new Error('获取版本历史失败');
  return res.json();
}

export async function rateQA(id: string, effectiveness_rating: number) {
  const res = await authFetch(`${API_BASE}/qa/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ effectiveness_rating }),
  });
  if (!res.ok) throw new Error('评分失败');
  return res.json();
}

export async function fetchStatistics(type: string = 'overview') {
  const res = await authFetch(`${API_BASE}/statistics?type=${type}`);
  if (!res.ok) throw new Error('获取统计数据失败');
  return res.json();
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  answers?: { id: string; answer: string }[];
  category_id: string | null;
  is_active: boolean;
  usage_count: number;
  answer_usage_counts: Record<string, number>;
  effectiveness_score: number;
  current_version: number;
  created_at: string;
  updated_at: string | null;
  categories: { id: string; name: string } | null;
  tags: Tag[];
}

export interface QARecord {
  id: string;
  question: string;
  answer: string;
  matched_entry_id: string | null;
  is_ai_generated: boolean;
  effectiveness_rating: number | null;
  created_at: string;
}

export interface EntryVersion {
  id: string;
  entry_id: string;
  version: number;
  question: string;
  answer: string;
  change_note: string | null;
  created_at: string;
}

export interface EntryComment {
  id: string;
  entry_id: string;
  author: string;
  content: string;
  is_merged: boolean;
  is_anonymous: boolean;
  created_at: string;
}

export async function importWord(data: {
  file: File;
  category_id?: string | null;
  tag_ids?: string[];
}) {
  const formData = new FormData();
  formData.append('file', data.file);
  if (data.category_id) {
    formData.append('category_id', data.category_id);
  }
  if (data.tag_ids && data.tag_ids.length > 0) {
    formData.append('tag_ids', data.tag_ids.join(','));
  }

  const res = await authFetch(`${API_BASE}/knowledge/import`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '导入失败');
  }
  return res.json();
}

// ===== 评论功能 =====

export async function fetchEntryComments(entryId: string) {
  const res = await authFetch(`${API_BASE}/knowledge/${entryId}/comments`);
  if (!res.ok) throw new Error('获取评论失败');
  return res.json();
}

export async function addEntryComment(entryId: string, data: { author?: string; content: string; is_anonymous?: boolean }) {
  const res = await authFetch(`${API_BASE}/knowledge/${entryId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '添加评论失败');
  }
  return res.json();
}

export async function deleteEntryComment(entryId: string, commentId: string) {
  const res = await authFetch(`${API_BASE}/knowledge/${entryId}/comments?comment_id=${commentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '删除评论失败');
  }
  return res.json();
}

export async function rateEntry(entryId: string, effectiveness_score: number) {
  const res = await authFetch(`${API_BASE}/knowledge/${entryId}/rate`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ effectiveness_score }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '评分失败');
  }
  return res.json();
}

export async function mergeCommentToAnswer(entryId: string, commentId: string) {
  const res = await authFetch(`${API_BASE}/knowledge/${entryId}/merge-comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_id: commentId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '合并评论到答案失败');
  }
  return res.json();
}

export async function recordUsage(entryId: string, answerIndex?: number): Promise<{ data: { id: string; usage_count: number; answer_usage_counts: Record<string, number>; counted: boolean } }> {
  const body: Record<string, unknown> = {};
  if (answerIndex !== undefined) body.answer_index = answerIndex;
  const res = await authFetch(`${API_BASE}/knowledge/${entryId}/use`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '记录使用失败');
  }
  return res.json();
}

export async function downloadTemplate() {
  const res = await authFetch(`${API_BASE}/knowledge/template`);
  if (!res.ok) throw new Error('下载模板失败');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'inquiry_scripts_template.xlsx';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// ===== 权限管理 =====

export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
}

export interface MemberOverride {
  user_id: string;
  permissions: string[];
}

export interface PermissionsData {
  definitions: PermissionDefinition[];
  permissionsByRole: Record<string, string[]>;
  memberOverrides: MemberOverride[];
  myPermissions: string[];
  myRole: string | null;
  isAdmin: boolean;
  isDeveloper: boolean;
}

export async function fetchPermissions(): Promise<{ data: PermissionsData }> {
  const res = await authFetch(`${API_BASE}/permissions`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '获取权限失败');
  }
  return res.json();
}

export async function updateRolePermissions(role: string, permissions: string[]) {
  const res = await authFetch(`${API_BASE}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'role', role, permissions }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '更新权限失败');
  }
  return res.json();
}

export async function updateMemberPermissions(userId: string, permissions: string[]) {
  const res = await authFetch(`${API_BASE}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'member', user_id: userId, permissions }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '更新成员权限失败');
  }
  return res.json();
}

export async function resetMemberPermissions(userId: string) {
  const res = await authFetch(`${API_BASE}/permissions`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'member', user_id: userId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '重置成员权限失败');
  }
  return res.json();
}

export interface EnterpriseMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  user_email?: string;
}

export async function fetchEnterpriseMembers(): Promise<{ data: EnterpriseMember[]; currentUserId: string }> {
  const res = await authFetch(`${API_BASE}/permissions/members`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '获取成员列表失败');
  }
  return res.json();
}

export async function updateMemberRole(memberId: string, role: string) {
  const res = await authFetch(`${API_BASE}/permissions/members`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId, role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '更新角色失败');
  }
  return res.json();
}

// ===== 开发者管理 =====

export async function checkDeveloper(): Promise<{ isDeveloper: boolean }> {
  const res = await authFetch(`${API_BASE}/developer/check`);
  if (!res.ok) return { isDeveloper: false };
  return res.json();
}

export interface DeveloperEnterprise {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  owner_email: string;
  member_count: number;
  license_started_at: string | null;
  license_expires_at: string | null;
  created_at: string;
  is_expired: boolean;
}

export async function fetchDeveloperEnterprises(): Promise<{ data: DeveloperEnterprise[] }> {
  const res = await authFetch(`${API_BASE}/developer/enterprises`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '获取企业列表失败');
  }
  return res.json();
}

export async function updateEnterpriseLicense(
  enterpriseId: string,
  data: { license_years?: number; license_expires_at?: string | null; name?: string }
) {
  const res = await authFetch(`${API_BASE}/developer/enterprises/${enterpriseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '更新授权失败');
  }
  return res.json();
}

export async function deleteEnterprise(enterpriseId: string) {
  const res = await authFetch(`${API_BASE}/developer/enterprises/${enterpriseId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '删除企业失败');
  }
  return res.json();
}

export async function fetchEnterpriseMembersById(enterpriseId: string) {
  const res = await authFetch(`${API_BASE}/developer/enterprises/${enterpriseId}/members`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '获取成员列表失败');
  }
  return res.json();
}

export async function removeEnterpriseMember(enterpriseId: string, userId: string) {
  const res = await authFetch(`${API_BASE}/developer/enterprises/${enterpriseId}/members?user_id=${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '移除成员失败');
  }
  return res.json();
}
