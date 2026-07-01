import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, isAdmin } from '@/lib/auth-helpers';

// GET /api/permissions/members - List all members with roles (admin only)
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
  }

  const isUserAdmin = await isAdmin(user.id, enterpriseId);
  if (!isUserAdmin) {
    return NextResponse.json({ error: '仅管理员可以查看成员列表' }, { status: 403 });
  }

  const client = getSupabaseClientOrThrow();

  // Get members
  const { data: members, error } = await client
    .from('enterprise_members')
    .select('id, user_id, role, joined_at')
    .eq('enterprise_id', enterpriseId)
    .order('joined_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: `获取成员列表失败: ${error.message}` }, { status: 500 });
  }

  // Try to fetch user emails using admin client
  const adminClient = getSupabaseClientOrThrow();
  const enrichedMembers = await Promise.all(
    (members || []).map(async (m: { id: string; user_id: string; role: string; joined_at: string }) => {
      let user_email = '';
      try {
        const { data: userInfo } = await adminClient.auth.admin.getUserById(m.user_id);
        user_email = userInfo?.user?.email || '';
      } catch {
        // ignore
      }
      return { ...m, user_email };
    })
  );

  return NextResponse.json({
    data: enrichedMembers,
    currentUserId: user.id,
  });
}

// PUT /api/permissions/members - Update a member's role (admin only)
export async function PUT(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
  }

  const isUserAdmin = await isAdmin(user.id, enterpriseId);
  if (!isUserAdmin) {
    return NextResponse.json({ error: '仅管理员可以修改成员角色' }, { status: 403 });
  }

  const body = await req.json();
  const { memberId, role } = body as { memberId: string; role: string };

  if (!memberId || !role) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  // Only allow 'admin' and 'member' roles
  if (!['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: '角色只能是 admin 或 member' }, { status: 400 });
  }

  const client = getSupabaseClientOrThrow();

  // Get the target member
  const { data: targetMember, error: findError } = await client
    .from('enterprise_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('enterprise_id', enterpriseId)
    .maybeSingle();

  if (findError || !targetMember) {
    return NextResponse.json({ error: '成员不存在' }, { status: 404 });
  }

  // Cannot change owner's role
  if (targetMember.role === 'owner') {
    return NextResponse.json({ error: '不能修改创建者的角色' }, { status: 403 });
  }

  // Cannot change own role
  if (targetMember.user_id === user.id) {
    return NextResponse.json({ error: '不能修改自己的角色' }, { status: 403 });
  }

  // Update role
  const { error: updateError } = await client
    .from('enterprise_members')
    .update({ role })
    .eq('id', memberId)
    .eq('enterprise_id', enterpriseId);

  if (updateError) {
    return NextResponse.json({ error: `更新角色失败: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ data: { memberId, role } });
}
