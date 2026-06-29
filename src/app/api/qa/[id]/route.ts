import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const client = getSupabaseClient();
  const body = await req.json();
  const { effectiveness_rating } = body;

  if (effectiveness_rating === undefined || effectiveness_rating < 1 || effectiveness_rating > 5) {
    return NextResponse.json({ error: '评分必须在1-5之间' }, { status: 400 });
  }

  const { data, error } = await client
    .from('qa_history')
    .update({ effectiveness_rating })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw new Error(`更新评分失败: ${error.message}`);
  if (!data) return NextResponse.json({ error: '记录不存在' }, { status: 404 });

  // Also update the effectiveness score for the matched entry
  const matchedEntryId = data.matched_entry_id as string | null;
  if (matchedEntryId) {
    // Calculate average effectiveness for this entry
    const { data: ratings, error: ratingsError } = await client
      .from('qa_history')
      .select('effectiveness_rating')
      .eq('matched_entry_id', matchedEntryId)
      .not('effectiveness_rating', 'is', null);

    if (!ratingsError && ratings && ratings.length > 0) {
      const avg = Math.round(
        ratings.reduce((sum: number, r: Record<string, unknown>) => sum + (r.effectiveness_rating as number), 0) / ratings.length
      );
      await client
        .from('knowledge_entries')
        .update({ effectiveness_score: avg })
        .eq('id', matchedEntryId);
    }
  }

  return NextResponse.json({ data });
}
