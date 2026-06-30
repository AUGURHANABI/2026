import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const client = getSupabaseClientOrThrow();
  const searchParams = req.nextUrl.searchParams;
  const category_id = searchParams.get('category_id');
  const tag_id = searchParams.get('tag_id');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('page_size') || '20', 10);
  const is_active = searchParams.get('is_active');

  let query = client
    .from('knowledge_entries')
    .select('*, categories(id, name), knowledge_entry_tags(tag_id, tags(id, name, color))', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Enterprise isolation - must have an enterprise to see data
  if (!enterpriseId) {
    return NextResponse.json({ data: [], total: 0, page, page_size: pageSize });
  }
  query = query.eq('enterprise_id', enterpriseId);

  if (category_id) {
    query = query.eq('category_id', category_id);
  }
  if (is_active !== null && is_active !== undefined && is_active !== '') {
    query = query.eq('is_active', is_active === 'true');
  }
  if (search) {
    query = query.or(`question.ilike.%${search}%,answer.ilike.%${search}%`);
  }

  // Tag filter needs sub-query approach
  if (tag_id) {
    const { data: tagEntries, error: tagError } = await client
      .from('knowledge_entry_tags')
      .select('entry_id')
      .eq('tag_id', tag_id);
    if (tagError) throw new Error(`查询标签关联失败: ${tagError.message}`);
    const entryIds = (tagEntries ?? []).map((t: { entry_id: string }) => t.entry_id);
    if (entryIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, page_size: pageSize });
    }
    query = query.in('id', entryIds);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(`查询知识库失败: ${error.message}`);

  // Transform the nested tag data
  const transformed: Array<Record<string, unknown>> = (data ?? []).map((entry: Record<string, unknown>) => {
    const tags = ((entry.knowledge_entry_tags as Array<Record<string, unknown>>) ?? []).map(
      (et: Record<string, unknown>) => et.tags as Record<string, unknown>
    ).filter(Boolean);
    const { knowledge_entry_tags: _ket, ...rest } = entry;
    return { ...rest, tags };
  });

  // Group entries by question — merge same-question entries into one with multiple answers
  const grouped = new Map<string, Record<string, unknown>>();
  for (const entry of transformed) {
    const key = String(entry.question).trim().toLowerCase();
    if (grouped.has(key)) {
      const existing = grouped.get(key)!;
      const existingAnswers = (existing.answers as Array<{ id: string; answer: string }>) ?? [];
      existingAnswers.push({ id: String(entry.id), answer: String(entry.answer) });
      existing.answers = existingAnswers;
      // Keep the most recent entry's metadata
      existing.usage_count = Number(entry.usage_count) + Number(existing.usage_count);
      existing.effectiveness_score = entry.effectiveness_score ?? existing.effectiveness_score;
    } else {
      grouped.set(key, {
        ...entry,
        answers: [{ id: String(entry.id), answer: String(entry.answer) }],
      });
    }
  }

  const result = Array.from(grouped.values());

  return NextResponse.json({ data: result, total: count, page, page_size: pageSize });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
  }
  const client = getSupabaseClientOrThrow();
  const body = await req.json();
  const { question, answer, category_id, tag_ids } = body;

  if (!question || !answer) {
    return NextResponse.json({ error: '问题和答案不能为空' }, { status: 400 });
  }

  // Create the entry
  const insertData: Record<string, unknown> = { question, answer, category_id, enterprise_id: enterpriseId, current_version: 1 };

  const { data: entry, error: entryError } = await client
    .from('knowledge_entries')
    .insert(insertData)
    .select()
    .maybeSingle();

  if (entryError) throw new Error(`创建条目失败: ${entryError.message}`);
  if (!entry) throw new Error('创建条目失败: 未返回数据');

  // Create initial version
  const { error: versionError } = await client
    .from('entry_versions')
    .insert({
      entry_id: entry.id,
      version: 1,
      question,
      answer,
      change_note: '初始版本',
    });

  if (versionError) throw new Error(`创建版本记录失败: ${versionError.message}`);

  // Create tag associations
  if (tag_ids && tag_ids.length > 0) {
    const tagRecords = tag_ids.map((tag_id: string) => ({
      entry_id: entry.id,
      tag_id,
    }));
    const { error: tagError } = await client
      .from('knowledge_entry_tags')
      .insert(tagRecords);
    if (tagError) throw new Error(`关联标签失败: ${tagError.message}`);
  }

  return NextResponse.json({ data: entry });
}
