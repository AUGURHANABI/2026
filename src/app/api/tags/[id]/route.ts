import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = getSupabaseClient();
  const body = await request.json();
  const { name, color } = body;

  const { data, error } = await client
    .from('tags')
    .update({ name, color })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw new Error(`更新标签失败: ${error.message}`);
  if (!data) return NextResponse.json({ error: '标签不存在' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = getSupabaseClient();
  const { error } = await client.from('tags').delete().eq('id', id);
  if (error) throw new Error(`删除标签失败: ${error.message}`);
  return NextResponse.json({ success: true });
}
