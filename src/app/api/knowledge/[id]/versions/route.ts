import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('entry_versions')
    .select('*')
    .eq('entry_id', id)
    .order('version', { ascending: false });

  if (error) throw new Error(`查询版本历史失败: ${error.message}`);
  return NextResponse.json({ data });
}
