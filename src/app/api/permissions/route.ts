import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, isAdmin, getUserRole, getPermissionClient } from '@/lib/auth-helpers';

// All available permissions with labels and categories
export const PERMISSION_DEFINITIONS = [
  { key: 'entry:create', label: '新增话术', category: '话术管理' },
  { key: 'entry:edit', label: '编辑话术', category: '话术管理' },
  { key: 'entry:delete', label: '删除话术', category: '话术管理' },
  { key: 'entry:import', label: '导入话术', category: '话术管理' },
  { key: 'category:manage', label: '管理分类', category: '分类与标签' },
  { key: 'tag:manage', label: '管理标签', category: '分类与标签' },
  { key: 'comment:delete', label: '删除评论', category: '评论管理' },
  { key: 'comment:merge', label: '合并评论到答案', category: '评论管理' },
  { key: 'entry:rate', label: '效果评分', category: '其他' },
  { key: 'qa:ask', label: 'AI 问答', category: '其他' },
] as const;

export type PermissionKey = typeof PERMISSION_DEFINITIONS[number]['key'];

// GET /api/permissions - Get permissions for the current enterprise
// Query params: ?user_id=xxx (optional, to get a specific member's effective permissions)
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
  }

  const client = getPermissionClient() || getSupabaseClientOrThrow();
  const userRole = await getUserRole(user.id, enterpriseId);
  const isUserAdmin = userRole === 'owner' || userRole === 'admin';

  // Get all role permissions for this enterprise
  const { data: rolePerms, error } = await client
    .from('enterprise_role_permissions')
    .select('role, permissions')
    .eq('enterprise_id', enterpriseId);

  if (error) {
    return NextResponse.json({ error: '获取权限失败' }, { status: 500 });
  }

  // Build permissions map by role
  const permissionsByRole: Record<string, string[]> = {};
  for (const rp of (rolePerms ?? [])) {
    permissionsByRole[rp.role] = rp.permissions as string[];
  }

  // Ensure member permissions exist (default)
  if (!permissionsByRole['member']) {
    permissionsByRole['member'] = ['entry:create', 'entry:rate', 'qa:ask'];
  }

  // Get all member-level overrides for this enterprise (admin only)
  let memberOverrides: Array<{ user_id: string; permissions: string[] }> = [];
  if (isUserAdmin) {
    try {
      const { data: overrides } = await client
        .from('enterprise_member_permissions')
        .select('user_id, permissions')
        .eq('enterprise_id', enterpriseId);
      memberOverrides = (overrides ?? []) as Array<{ user_id: string; permissions: string[] }>;
    } catch {
      // Table might not exist in production yet
      memberOverrides = [];
    }
  }

  // Calculate current user's effective permissions
  let myPermissions: string[];
  if (isUserAdmin) {
    myPermissions = PERMISSION_DEFINITIONS.map(p => p.key);
  } else {
    // Check member-level override first
    const myOverride = memberOverrides.find(o => o.user_id === user.id);
    if (myOverride) {
      myPermissions = myOverride.permissions;
    } else {
      myPermissions = permissionsByRole['member'] || [];
    }
  }

  return NextResponse.json({
    data: {
      definitions: PERMISSION_DEFINITIONS,
      permissionsByRole,
      memberOverrides,
      myPermissions,
      myRole: userRole,
      isAdmin: isUserAdmin,
    },
  });
}

// PUT /api/permissions - Update permissions
// Body: { type: 'role', role: 'member', permissions: [...] }
//    or: { type: 'member', user_id: 'xxx', permissions: [...] }
export async function PUT(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
  }

  // Only admins can update permissions
  const isUserAdmin = await isAdmin(user.id, enterpriseId);
  if (!isUserAdmin) {
    return NextResponse.json({ error: '仅管理员可以设置权限' }, { status: 403 });
  }

  const body = await req.json();
  const { type, role, user_id, permissions } = body as {
    type?: 'role' | 'member';
    role?: string;
    user_id?: string;
    permissions: string[];
  };

  if (!Array.isArray(permissions)) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  // Validate permission keys
  const validKeys: string[] = PERMISSION_DEFINITIONS.map(p => p.key);
  const filteredPermissions = permissions.filter((p: string) => validKeys.includes(p));

  const client = getPermissionClient() || getSupabaseClientOrThrow();

  // Type: role-level permissions
  if (!type || type === 'role') {
    if (!role) {
      return NextResponse.json({ error: '缺少 role 参数' }, { status: 400 });
    }
    if (role !== 'member') {
      return NextResponse.json({ error: '仅可设置普通成员权限' }, { status: 400 });
    }

    const { data, error } = await client
      .from('enterprise_role_permissions')
      .upsert(
        {
          enterprise_id: enterpriseId,
          role: 'member',
          permissions: filteredPermissions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'enterprise_id,role' }
      )
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: `更新权限失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  // Type: member-level permissions
  if (type === 'member') {
    if (!user_id) {
      return NextResponse.json({ error: '缺少 user_id 参数' }, { status: 400 });
    }

    // Verify the target user is a member (not owner/admin) of this enterprise
    const targetRole = await getUserRole(user_id, enterpriseId);
    if (!targetRole) {
      return NextResponse.json({ error: '该用户不属于当前企业' }, { status: 400 });
    }
    if (targetRole === 'owner' || targetRole === 'admin') {
      return NextResponse.json({ error: '管理员默认拥有所有权限，无需单独设置' }, { status: 400 });
    }

    const { data, error } = await client
      .from('enterprise_member_permissions')
      .upsert(
        {
          enterprise_id: enterpriseId,
          user_id,
          permissions: filteredPermissions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'enterprise_id,user_id' }
      )
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: `更新成员权限失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: '无效的 type 参数' }, { status: 400 });
}

// DELETE /api/permissions - Remove member-level override (revert to role defaults)
// Body: { type: 'member', user_id: 'xxx' }
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
  }

  const isUserAdmin = await isAdmin(user.id, enterpriseId);
  if (!isUserAdmin) {
    return NextResponse.json({ error: '仅管理员可以设置权限' }, { status: 403 });
  }

  const body = await req.json();
  const { type, user_id } = body as { type?: string; user_id?: string };

  if (type !== 'member' || !user_id) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  const client = getPermissionClient() || getSupabaseClientOrThrow();
  const { error } = await client
    .from('enterprise_member_permissions')
    .delete()
    .eq('enterprise_id', enterpriseId)
    .eq('user_id', user_id);

  if (error) {
    return NextResponse.json({ error: `重置成员权限失败: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
