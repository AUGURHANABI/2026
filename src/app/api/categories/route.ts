import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`查询分类失败: ${error.message}`);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const client = getSupabaseClient();
  const body = await request.json();
  const { name, description, sort_order } = body;

  if (!name) {
    return NextResponse.json({ error: '分类名称不能为空' }, { status: 400 });
  }

  const { data, error } = await client
    .from('categories')
    .insert({ name, description, sort_order: sort_order ?? 0 })
    .select()
    .maybeSingle();

  if (error) throw new Error(`创建分类失败: ${error.message}`);
  return NextResponse.json({ data });
}
