import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const client = getSupabaseClientOrThrow();

  let query = client.from('categories').select('*').order('sort_order', { ascending: true });
  if (enterpriseId) {
    query = query.eq('enterprise_id', enterpriseId);
  } else {
    query = query.is('enterprise_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`查询分类失败: ${error.message}`);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const client = getSupabaseClientOrThrow();
  const body = await req.json();
  const { name, description, sort_order } = body;

  if (!name) {
    return NextResponse.json({ error: '分类名称不能为空' }, { status: 400 });
  }

  const insertData: Record<string, unknown> = { name, description, sort_order: sort_order ?? 0 };
  if (enterpriseId) {
    insertData.enterprise_id = enterpriseId;
  }

  const { data, error } = await client
    .from('categories')
    .insert(insertData)
    .select()
    .maybeSingle();

  if (error) throw new Error(`创建分类失败: ${error.message}`);
  return NextResponse.json({ data });
}
