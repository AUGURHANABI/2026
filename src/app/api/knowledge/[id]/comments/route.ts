import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';

// GET /api/knowledge/[id]/comments — 获取条目评论列表
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const client = getSupabaseClientOrThrow();

  const { data, error } = await client
    .from('entry_comments')
    .select('*')
    .eq('entry_id', id)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`获取评论失败: ${error.message}`);

  return NextResponse.json({ data });
}

// POST /api/knowledge/[id]/comments — 添加评论
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const body = await req.json();
  const { author, content, is_anonymous } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: '评论内容不能为空' }, { status: 400 });
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
    .from('entry_comments')
    .insert({
      entry_id: id,
      author: is_anonymous ? '匿名用户***' : (author?.trim() || user.email || '匿名用户'),
      content: content.trim(),
      is_anonymous: is_anonymous ?? false,
    })
    .select()
    .single();

  if (error) throw new Error(`添加评论失败: ${error.message}`);

  return NextResponse.json({ data });
}

// DELETE /api/knowledge/[id]/comments?comment_id=xxx — 删除评论
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  // Check permission: comment:delete
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (enterpriseId) {
    // License check
    const licenseErr = await checkLicenseExpired(enterpriseId);
    if (licenseErr) return licenseErr;

    const canDelete = await checkPermission(user.id, enterpriseId, 'comment:delete');
    if (!canDelete) return forbiddenResponse('comment:delete');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const commentId = req.nextUrl.searchParams.get('comment_id');

  if (!commentId) {
    return NextResponse.json({ error: '缺少 comment_id 参数' }, { status: 400 });
  }

  const { error } = await client
    .from('entry_comments')
    .delete()
    .eq('id', commentId)
    .eq('entry_id', id);

  if (error) throw new Error(`删除评论失败: ${error.message}`);

  return NextResponse.json({ success: true });
}
