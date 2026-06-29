import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, unauthorizedResponse } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const client = getSupabaseClient();

  let query = client.from('tags').select('*').order('name', { ascending: true });
  if (enterpriseId) {
    query = query.eq('enterprise_id', enterpriseId);
  } else {
    query = query.is('enterprise_id', null);
  }

  const { data, error } = await query;
  if (error) throw new Error(`查询标签失败: ${error.message}`);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const client = getSupabaseClient();
  const body = await req.json();
  const { name, color } = body;

  if (!name) {
    return NextResponse.json({ error: '标签名称不能为空' }, { status: 400 });
  }

  const insertData: Record<string, unknown> = { name, color: color ?? '#0891b2' };
  if (enterpriseId) {
    insertData.enterprise_id = enterpriseId;
  }

  const { data, error } = await client
    .from('tags')
    .insert(insertData)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '标签名称已存在' }, { status: 409 });
    }
    throw new Error(`创建标签失败: ${error.message}`);
  }
  return NextResponse.json({ data });
}
