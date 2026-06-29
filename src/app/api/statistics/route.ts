import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const client = getSupabaseClient();
  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get('type') || 'overview';

  // Build enterprise filter helper
  const entFilter = enterpriseId ? { col: 'enterprise_id', val: enterpriseId } : { col: 'enterprise_id', val: null as string | null, isNull: true };
  const applyEntFilter = (query: ReturnType<typeof client.from>['select'] | ReturnType<typeof client.from>['select'] | ReturnType<typeof client.from>['select']) => {
    // We need a different approach since query builder types are complex
    return query;
  };

  if (type === 'overview') {
    // Build base queries with enterprise filter
    const entriesQuery = client.from('knowledge_entries').select('*', { count: 'exact', head: true });
    const categoriesQuery = client.from('categories').select('*', { count: 'exact', head: true });
    const tagsQuery = client.from('tags').select('*', { count: 'exact', head: true });
    const qaQuery = client.from('qa_history').select('*', { count: 'exact', head: true });

    // Apply enterprise isolation
    const filteredEntries = enterpriseId ? entriesQuery.eq('enterprise_id', enterpriseId) : entriesQuery.is('enterprise_id', null);
    const filteredCategories = enterpriseId ? categoriesQuery.eq('enterprise_id', enterpriseId) : categoriesQuery.is('enterprise_id', null);
    const filteredTags = enterpriseId ? tagsQuery.eq('enterprise_id', enterpriseId) : tagsQuery.is('enterprise_id', null);
    const filteredQA = enterpriseId ? qaQuery.eq('enterprise_id', enterpriseId) : qaQuery.is('enterprise_id', null);

    const [
      { count: totalEntries, error: entriesError },
      { count: totalCategories, error: categoriesError },
      { count: totalTags, error: tagsError },
      { count: totalQA, error: qaError },
    ] = await Promise.all([filteredEntries, filteredCategories, filteredTags, filteredQA]);

    if (entriesError) throw new Error(`统计条目数失败: ${entriesError.message}`);
    if (categoriesError) throw new Error(`统计分类数失败: ${categoriesError.message}`);
    if (tagsError) throw new Error(`统计标签数失败: ${tagsError.message}`);
    if (qaError) throw new Error(`统计问答数失败: ${qaError.message}`);

    // Get top entries by usage
    let topEntriesQuery = client
      .from('knowledge_entries')
      .select('id, question, usage_count, effectiveness_score, categories(name)')
      .order('usage_count', { ascending: false })
      .limit(5);
    topEntriesQuery = enterpriseId ? topEntriesQuery.eq('enterprise_id', enterpriseId) : topEntriesQuery.is('enterprise_id', null);

    const { data: topEntries, error: topError } = await topEntriesQuery;
    if (topError) throw new Error(`查询热门话术失败: ${topError.message}`);

    // Get recent QA history
    let recentQAQuery = client
      .from('qa_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    recentQAQuery = enterpriseId ? recentQAQuery.eq('enterprise_id', enterpriseId) : recentQAQuery.is('enterprise_id', null);

    const { data: recentQA, error: recentError } = await recentQAQuery;
    if (recentError) throw new Error(`查询最近问答失败: ${recentError.message}`);

    // Get category distribution
    let catDistQuery = client
      .from('knowledge_entries')
      .select('category_id, categories(id, name)');
    catDistQuery = enterpriseId ? catDistQuery.eq('enterprise_id', enterpriseId) : catDistQuery.is('enterprise_id', null);

    const { data: categoryDist, error: catDistError } = await catDistQuery;
    if (catDistError) throw new Error(`查询分类分布失败: ${catDistError.message}`);

    const categoryMap = new Map<string, { name: string; count: number }>();
    for (const entry of categoryDist ?? []) {
      const cat = entry.categories as unknown as Record<string, string> | null;
      const catName = cat?.name ?? '未分类';
      const catId = (cat?.id as string) ?? 'none';
      const existing = categoryMap.get(catId);
      if (existing) {
        existing.count++;
      } else {
        categoryMap.set(catId, { name: catName, count: 1 });
      }
    }

    return NextResponse.json({
      data: {
        total_entries: totalEntries ?? 0,
        total_categories: totalCategories ?? 0,
        total_tags: totalTags ?? 0,
        total_qa: totalQA ?? 0,
        top_entries: topEntries ?? [],
        recent_qa: recentQA ?? [],
        category_distribution: Array.from(categoryMap.values()),
      },
    });
  }

  if (type === 'qa_history') {
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '20', 10);
    const from = (page - 1) * pageSize;

    let query = client
      .from('qa_history')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    query = enterpriseId ? query.eq('enterprise_id', enterpriseId) : query.is('enterprise_id', null);

    const { data, error, count } = await query;
    if (error) throw new Error(`查询问答历史失败: ${error.message}`);
    return NextResponse.json({ data, total: count, page, page_size: pageSize });
  }

  if (type === 'effectiveness') {
    let query = client
      .from('qa_history')
      .select('effectiveness_rating')
      .not('effectiveness_rating', 'is', null);
    query = enterpriseId ? query.eq('enterprise_id', enterpriseId) : query.is('enterprise_id', null);

    const { data, error } = await query;
    if (error) throw new Error(`查询效果评分失败: ${error.message}`);

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalScore = 0;
    let totalRated = 0;
    for (const item of data ?? []) {
      const rating = item.effectiveness_rating as number;
      if (rating >= 1 && rating <= 5) {
        distribution[rating]++;
        totalScore += rating;
        totalRated++;
      }
    }

    return NextResponse.json({
      data: {
        distribution,
        average: totalRated > 0 ? Math.round((totalScore / totalRated) * 10) / 10 : 0,
        total_rated: totalRated,
      },
    });
  }

  return NextResponse.json({ error: '未知的统计类型' }, { status: 400 });
}
