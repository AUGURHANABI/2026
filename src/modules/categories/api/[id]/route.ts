import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse } from '@/shared/lib/auth-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const { data, error } = await client
    .from('categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`查询分类失败: ${error.message}`);
  if (!data) return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  // Check permission: category:manage
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (enterpriseId) {
    const canManage = await checkPermission(user.id, enterpriseId, 'category:manage');
    if (!canManage) return forbiddenResponse('category:manage');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const body = await req.json();
  const { name, description, sort_order } = body;

  const { data, error } = await client
    .from('categories')
    .update({ name, description, sort_order, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw new Error(`更新分类失败: ${error.message}`);
  if (!data) return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  // Check permission: category:manage
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (enterpriseId) {
    const canManage = await checkPermission(user.id, enterpriseId, 'category:manage');
    if (!canManage) return forbiddenResponse('category:manage');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();

  // Check if any knowledge entries use this category
  const { count, error: countError } = await client
    .from('knowledge_entries')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', id);

  if (countError) throw new Error(`查询关联条目失败: ${countError.message}`);
  if (count && count > 0) {
    return NextResponse.json(
      { error: `该分类下还有 ${count} 条话术，请先移动或删除后再操作` },
      { status: 400 }
    );
  }

  const { error } = await client.from('categories').delete().eq('id', id);
  if (error) throw new Error(`删除分类失败: ${error.message}`);
  return NextResponse.json({ success: true });
}
