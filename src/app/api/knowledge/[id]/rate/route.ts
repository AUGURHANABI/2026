import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

// PUT /api/knowledge/[id]/rate — 给知识库条目评分
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const client = getSupabaseClient();
  const body = await req.json();
  const { effectiveness_score } = body;

  if (effectiveness_score === undefined || effectiveness_score === null) {
    return NextResponse.json({ error: '缺少 effectiveness_score 参数' }, { status: 400 });
  }

  const score = Number(effectiveness_score);
  if (isNaN(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: '评分必须在 1-5 之间' }, { status: 400 });
  }

  // 验证条目存在
  const { data: entry, error: entryError } = await client
    .from('knowledge_entries')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (entryError) throw new Error(`查询条目失败: ${entryError.message}`);
  if (!entry) return NextResponse.json({ error: '条目不存在' }, { status: 404 });

  const { data, error } = await client
    .from('knowledge_entries')
    .update({ effectiveness_score: score, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, effectiveness_score')
    .single();

  if (error) throw new Error(`评分失败: ${error.message}`);

  return NextResponse.json({ data });
}
