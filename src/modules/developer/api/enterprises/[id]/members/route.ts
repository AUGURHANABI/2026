import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isDeveloper, getPermissionClient } from '@/shared/lib/auth-helpers';

// GET /api/developer/enterprises/[id]/members - Get enterprise members (developer only)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const dev = await isDeveloper(user.id);
  if (!dev) return NextResponse.json({ error: '仅开发者可访问' }, { status: 403 });

  const { id } = await params;

  const client = getPermissionClient();
  if (!client) return NextResponse.json({ error: '服务错误' }, { status: 500 });

  const { data: members, error } = await client
    .from('enterprise_members')
    .select('id, user_id, role, joined_at')
    .eq('enterprise_id', id)
    .order('joined_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get user emails
  let emails: Record<string, string> = {};
  try {
    const { getSupabaseAdminClient } = await import('@/storage/database/supabase-client');
    const adminClient = getSupabaseAdminClient();
    if (adminClient) {
      const userIds = (members ?? []).map((m: Record<string, unknown>) => m.user_id as string);
      const { data: users } = await adminClient.auth.admin.listUsers();
      for (const u of (users?.users ?? [])) {
        if (userIds.includes(u.id)) {
          emails[u.id] = u.email || '';
        }
      }
    }
  } catch {
    // Ignore errors
  }

  const result = (members ?? []).map((m: Record<string, unknown>) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    email: emails[m.user_id as string] || '',
  }));

  return NextResponse.json({ data: result });
}

// DELETE /api/developer/enterprises/[id]/members - Remove member from enterprise (developer only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const dev = await isDeveloper(user.id);
  if (!dev) return NextResponse.json({ error: '仅开发者可访问' }, { status: 403 });

  const { id } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get('user_id');

  if (!userId) return NextResponse.json({ error: '缺少 user_id 参数' }, { status: 400 });

  const client = getPermissionClient();
  if (!client) return NextResponse.json({ error: '服务错误' }, { status: 500 });

  const { error } = await client
    .from('enterprise_members')
    .delete()
    .eq('enterprise_id', id)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
