import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, unauthorizedResponse } from '@/shared/lib/auth-helpers';

// 防重复：同一个 entry + answerIndex 在 30 秒内只计一次使用
const recentUsage = new Map<string, number>();
const DEBOUNCE_MS = 30_000;

function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, timestamp] of recentUsage) {
    if (now - timestamp > DEBOUNCE_MS) {
      recentUsage.delete(key);
    }
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  try {
    const supabase = getSupabaseClientOrThrow();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const answerIndex = typeof body.answer_index === 'number' ? body.answer_index : -1;

    // 防重复 key：id + answerIndex
    const dedupeKey = answerIndex >= 0 ? `${id}:${answerIndex}` : id;

    // 防重复检查：30 秒内同一答案不重复计数
    cleanupOldEntries();
    const lastUsed = recentUsage.get(dedupeKey);
    if (lastUsed && Date.now() - lastUsed < DEBOUNCE_MS) {
      // 30 秒内已记录过，不重复计数，但仍返回当前值
      const { data: entry } = await supabase
        .from('knowledge_entries')
        .select('id, usage_count, answer_usage_counts')
        .eq('id', id)
        .single();

      const usageCounts = entry?.answer_usage_counts || {};
      return NextResponse.json({
        data: {
          id,
          usage_count: entry?.usage_count ?? 0,
          answer_usage_counts: usageCounts,
          answer_index: answerIndex,
          counted: false,
        },
      });
    }

    // 记录本次使用时间
    recentUsage.set(dedupeKey, Date.now());

    // 获取当前数据
    const { data: current } = await supabase
      .from('knowledge_entries')
      .select('usage_count, answer_usage_counts')
      .eq('id', id)
      .single();

    if (!current) {
      return NextResponse.json({ error: '条目不存在' }, { status: 404 });
    }

    // 自增总 usage_count
    const newTotalCount = (current.usage_count || 0) + 1;

    // 自增特定 answer_index 的 usage_count
    const answerUsageCounts: Record<string, number> = current.answer_usage_counts || {};
    if (answerIndex >= 0) {
      const key = String(answerIndex);
      answerUsageCounts[key] = (answerUsageCounts[key] || 0) + 1;
    }

    const { error } = await supabase
      .from('knowledge_entries')
      .update({
        usage_count: newTotalCount,
        answer_usage_counts: answerUsageCounts,
      })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      data: {
        id,
        usage_count: newTotalCount,
        answer_usage_counts: answerUsageCounts,
        answer_index: answerIndex,
        counted: true,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '记录使用失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
