import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';

// POST /api/knowledge/[id]/merge-comment — 将评论内容合并到答案中
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  // Check permission: comment:merge
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (enterpriseId) {
    // License check
    const licenseErr = await checkLicenseExpired(enterpriseId);
    if (licenseErr) return licenseErr;

    const canMerge = await checkPermission(user.id, enterpriseId, 'comment:merge');
    if (!canMerge) return forbiddenResponse('comment:merge');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const body = await req.json();
  const { comment_id } = body;

  if (!comment_id) {
    return NextResponse.json({ error: '缺少 comment_id 参数' }, { status: 400 });
  }

  // 获取当前条目
  const { data: entry, error: entryError } = await client
    .from('knowledge_entries')
    .select('id, answer, current_version')
    .eq('id', id)
    .maybeSingle();

  if (entryError) throw new Error(`查询条目失败: ${entryError.message}`);
  if (!entry) return NextResponse.json({ error: '条目不存在' }, { status: 404 });

  // 获取评论
  const { data: comment, error: commentError } = await client
    .from('entry_comments')
    .select('id, content, is_merged')
    .eq('id', comment_id)
    .eq('entry_id', id)
    .maybeSingle();

  if (commentError) throw new Error(`查询评论失败: ${commentError.message}`);
  if (!comment) return NextResponse.json({ error: '评论不存在' }, { status: 404 });
  if (comment.is_merged) {
    return NextResponse.json({ error: '该评论已合并，请勿重复操作' }, { status: 400 });
  }

  // 将评论内容追加到答案末尾
  const newAnswer = `${entry.answer}\n\n---\n补充（来自评论）：${comment.content}`;
  const newVersion = entry.current_version + 1;

  // 更新条目答案
  const { error: updateError } = await client
    .from('knowledge_entries')
    .update({
      answer: newAnswer,
      current_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) throw new Error(`更新答案失败: ${updateError.message}`);

  // 标记评论为已合并
  const { error: mergeError } = await client
    .from('entry_comments')
    .update({ is_merged: true })
    .eq('id', comment_id);

  if (mergeError) throw new Error(`更新评论状态失败: ${mergeError.message}`);

  // 创建版本记录
  const { error: versionError } = await client
    .from('entry_versions')
    .insert({
      entry_id: id,
      version: newVersion,
      question: '',  // 只更新了答案，问题不变
      answer: newAnswer,
      change_note: '合并评论到答案',
    });

  if (versionError) throw new Error(`创建版本记录失败: ${versionError.message}`);

  return NextResponse.json({
    data: {
      id,
      new_answer: newAnswer,
      new_version: newVersion,
      merged_comment_id: comment_id,
    },
  });
}
