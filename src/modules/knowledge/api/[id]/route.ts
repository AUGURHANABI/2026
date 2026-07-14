import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/shared/lib/auth-helpers';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const client = getSupabaseClientOrThrow();

  const { data, error } = await client
    .from('knowledge_entries')
    .select('*, categories(id, name), knowledge_entry_tags(tag_id, tags(id, name, color))')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`查询条目失败: ${error.message}`);
  if (!data) return NextResponse.json({ error: '条目不存在' }, { status: 404 });

  // Transform nested tag data
  const tags = ((data.knowledge_entry_tags as Array<Record<string, unknown>>) ?? []).map(
    (et: Record<string, unknown>) => et.tags as Record<string, unknown>
  ).filter(Boolean);
  const { knowledge_entry_tags: _ket, ...rest } = data;

  return NextResponse.json({ data: { ...rest, tags } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const body = await req.json();
  const { question, answer, category_id, tag_ids, is_active, change_note, effectiveness_score } = body;

  // Check permission for content edits (question/answer/is_active changes)
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (enterpriseId) {
    // License check
    const licenseErr = await checkLicenseExpired(enterpriseId);
    if (licenseErr) return licenseErr;

    const isContentEdit = question !== undefined || answer !== undefined || is_active !== undefined;
    if (isContentEdit) {
      const canEdit = await checkPermission(user.id, enterpriseId, 'entry:edit');
      if (!canEdit) return forbiddenResponse('entry:edit');
    }
  }

  // Get current entry to check version
  const { data: current, error: fetchError } = await client
    .from('knowledge_entries')
    .select('current_version, question, answer')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) throw new Error(`查询当前条目失败: ${fetchError.message}`);
  if (!current) return NextResponse.json({ error: '条目不存在' }, { status: 404 });

  const newVersion = (question && question !== current.question) || (answer && answer !== current.answer)
    ? current.current_version + 1
    : current.current_version;

  // Update the entry
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    current_version: newVersion,
  };
  if (question !== undefined) updateData.question = question;
  if (answer !== undefined) updateData.answer = answer;
  if (category_id !== undefined) updateData.category_id = category_id;
  if (is_active !== undefined) updateData.is_active = is_active;
  if (effectiveness_score !== undefined) updateData.effectiveness_score = effectiveness_score;

  const { data, error } = await client
    .from('knowledge_entries')
    .update(updateData)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw new Error(`更新条目失败: ${error.message}`);

  // Create version record if content changed
  if (newVersion > current.current_version) {
    const { error: versionError } = await client
      .from('entry_versions')
      .insert({
        entry_id: id,
        version: newVersion,
        question: question ?? current.question,
        answer: answer ?? current.answer,
        change_note: change_note ?? `更新至版本 ${newVersion}`,
      });
    if (versionError) throw new Error(`创建版本记录失败: ${versionError.message}`);
  }

  // Update tag associations if provided
  if (tag_ids !== undefined) {
    // Delete existing tag associations
    const { error: deleteError } = await client
      .from('knowledge_entry_tags')
      .delete()
      .eq('entry_id', id);
    if (deleteError) throw new Error(`删除旧标签关联失败: ${deleteError.message}`);

    // Create new tag associations
    if (tag_ids.length > 0) {
      const tagRecords = tag_ids.map((tag_id: string) => ({
        entry_id: id,
        tag_id,
      }));
      const { error: tagError } = await client
        .from('knowledge_entry_tags')
        .insert(tagRecords);
      if (tagError) throw new Error(`关联标签失败: ${tagError.message}`);
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  // Check permission: entry:delete
  const enterpriseId = await getEnterpriseId(req, user.id);
  if (enterpriseId) {
    // License check
    const licenseErr = await checkLicenseExpired(enterpriseId);
    if (licenseErr) return licenseErr;

    const canDelete = await checkPermission(user.id, enterpriseId, 'entry:delete');
    if (!canDelete) return forbiddenResponse('entry:delete');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();
  const { error } = await client.from('knowledge_entries').delete().eq('id', id);
  if (error) throw new Error(`删除条目失败: ${error.message}`);
  return NextResponse.json({ success: true });
}
