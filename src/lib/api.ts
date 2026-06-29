const API_BASE = '/api';

export async function fetchCategories() {
  const res = await fetch(`${API_BASE}/categories`);
  if (!res.ok) throw new Error('获取分类失败');
  return res.json();
}

export async function createCategory(data: { name: string; description?: string; sort_order?: number }) {
  const res = await fetch(`${API_BASE}/categories`, {
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
  const res = await fetch(`${API_BASE}/categories/${id}`, {
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
  const res = await fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '删除分类失败');
  }
  return res.json();
}

export async function fetchTags() {
  const res = await fetch(`${API_BASE}/tags`);
  if (!res.ok) throw new Error('获取标签失败');
  return res.json();
}

export async function createTag(data: { name: string; color?: string }) {
  const res = await fetch(`${API_BASE}/tags`, {
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
  const res = await fetch(`${API_BASE}/tags/${id}`, {
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
  const res = await fetch(`${API_BASE}/tags/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '删除标签失败');
  }
  return res.json();
}

export async function fetchKnowledge(params?: {
  category_id?: string;
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
  const res = await fetch(`${API_BASE}/knowledge?${searchParams.toString()}`);
  if (!res.ok) throw new Error('获取知识库失败');
  return res.json();
}

export async function fetchKnowledgeById(id: string) {
  const res = await fetch(`${API_BASE}/knowledge/${id}`);
  if (!res.ok) throw new Error('获取条目详情失败');
  return res.json();
}

export async function createKnowledge(data: {
  question: string;
  answer: string;
  category_id?: string;
  tag_ids?: string[];
}) {
  const res = await fetch(`${API_BASE}/knowledge`, {
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
  category_id?: string;
  tag_ids?: string[];
  is_active?: boolean;
  change_note?: string;
  effectiveness_score?: number;
}) {
  const res = await fetch(`${API_BASE}/knowledge/${id}`, {
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
  const res = await fetch(`${API_BASE}/knowledge/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '删除条目失败');
  }
  return res.json();
}

export async function fetchEntryVersions(id: string) {
  const res = await fetch(`${API_BASE}/knowledge/${id}/versions`);
  if (!res.ok) throw new Error('获取版本历史失败');
  return res.json();
}

export async function rateQA(id: string, effectiveness_rating: number) {
  const res = await fetch(`${API_BASE}/qa/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ effectiveness_rating }),
  });
  if (!res.ok) throw new Error('评分失败');
  return res.json();
}

export async function fetchStatistics(type: string = 'overview') {
  const res = await fetch(`${API_BASE}/statistics?type=${type}`);
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
  category_id: string | null;
  is_active: boolean;
  usage_count: number;
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
