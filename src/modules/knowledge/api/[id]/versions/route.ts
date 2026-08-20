import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, isKnowledgeEntryInEnterprise, unauthorizedResponse, forbiddenResponse } from '@/shared/lib/auth-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) return forbiddenResponse();
  if (!(await isKnowledgeEntryInEnterprise(id, enterpriseId))) {
    return NextResponse.json({ error: '条目不存在' }, { status: 404 });
  }

  const client = getSupabaseClientOrThrow();

  const { data, error } = await client
    .from('entry_versions')
    .select('*')
    .eq('entry_id', id)
    .order('version', { ascending: false });

  if (error) throw new Error(`查询版本历史失败: ${error.message}`);
  return NextResponse.json({ data });
}
