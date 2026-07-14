import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse } from '@/shared/lib/auth-helpers';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  // Check permission: tag:manage
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (enterpriseId) {
    const canManage = await checkPermission(user.id, enterpriseId, 'tag:manage');
    if (!canManage) return forbiddenResponse('tag:manage');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const body = await req.json();
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  // Check permission: tag:manage
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (enterpriseId) {
    const canManage = await checkPermission(user.id, enterpriseId, 'tag:manage');
    if (!canManage) return forbiddenResponse('tag:manage');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const { error } = await client.from('tags').delete().eq('id', id);
  if (error) throw new Error(`删除标签失败: ${error.message}`);
  return NextResponse.json({ success: true });
}
