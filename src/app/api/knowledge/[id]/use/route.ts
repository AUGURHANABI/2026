import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth-helpers';

const supabase = getSupabaseClient();

// 防重复：同一个 entry 在 30 秒内只计一次使用
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
    const { id } = await params;

    // 防重复检查：30 秒内同一条目不重复计数
    cleanupOldEntries();
    const lastUsed = recentUsage.get(id);
    if (lastUsed && Date.now() - lastUsed < DEBOUNCE_MS) {
      // 30 秒内已记录过，不重复计数，但仍返回当前值
      const { data: entry } = await supabase
        .from('knowledge_entries')
        .select('id, usage_count')
        .eq('id', id)
        .single();

      return NextResponse.json({
        data: { id, usage_count: entry?.usage_count ?? 0, counted: false },
      });
    }

    // 记录本次使用时间
    recentUsage.set(id, Date.now());

    // 自增 usage_count
    const { data: current } = await supabase
      .from('knowledge_entries')
      .select('usage_count')
      .eq('id', id)
      .single();

    if (!current) {
      return NextResponse.json({ error: '条目不存在' }, { status: 404 });
    }

    const newCount = (current.usage_count || 0) + 1;

    const { error } = await supabase
      .from('knowledge_entries')
      .update({ usage_count: newCount })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({
      data: { id, usage_count: newCount, counted: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '记录使用失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
