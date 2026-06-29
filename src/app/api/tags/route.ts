import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('tags')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(`查询标签失败: ${error.message}`);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { name, color } = body;

  if (!name) {
    return NextResponse.json({ error: '标签名称不能为空' }, { status: 400 });
  }

  const { data, error } = await client
    .from('tags')
    .insert({ name, color: color ?? '#0891b2' })
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
