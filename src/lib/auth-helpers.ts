import { NextRequest } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * Verify session token from x-session header and return the user.
 * Returns null if not authenticated.
 */
export async function getAuthUser(req: NextRequest): Promise<User | null> {
  const token = req.headers.get('x-session');
  if (!token) return null;

  try {
    const client = getSupabaseClientOrThrow(token);
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Get the enterprise_id for the current user from the request.
 * First checks header, then query param, then request body, then looks up membership.
 */
export async function getEnterpriseId(req: NextRequest, userId: string): Promise<string | null> {
  const headerEnterpriseId = req.headers.get('x-enterprise-id');
  if (headerEnterpriseId) return headerEnterpriseId;

  const url = new URL(req.url);
  const enterpriseId = url.searchParams.get('enterprise_id');
  if (enterpriseId) return enterpriseId;

  try {
    const cloned = req.clone();
    const body = await cloned.json().catch(() => ({}));
    if (body.enterprise_id) return body.enterprise_id;
  } catch {
    // Ignore parse errors
  }

  const client = getSupabaseClientOrThrow();
  const { data: membership } = await client
    .from('enterprise_members')
    .select('enterprise_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return membership?.enterprise_id || null;
}

/**
 * Get the user's role in a specific enterprise.
 * Returns null if user is not a member of the enterprise.
 */
export async function getUserRole(userId: string, enterpriseId: string): Promise<string | null> {
  const client = getSupabaseClientOrThrow();
  const { data: membership } = await client
    .from('enterprise_members')
    .select('role')
    .eq('user_id', userId)
    .eq('enterprise_id', enterpriseId)
    .maybeSingle();

  return membership?.role || null;
}

/**
 * Check if a user has a specific permission in their enterprise.
 * - Owner/Admin always has all permissions
 * - Member-level overrides (enterprise_member_permissions) take priority
 * - Falls back to role-level permissions (enterprise_role_permissions)
 */
export async function checkPermission(
  userId: string,
  enterpriseId: string,
  permission: string
): Promise<boolean> {
  const role = await getUserRole(userId, enterpriseId);

  // Owner and admin always have all permissions
  if (role === 'owner' || role === 'admin') return true;

  // Not a member
  if (!role) return false;

  const client = getSupabaseClientOrThrow();

  // 1. Check member-level override first
  const { data: memberPerms } = await client
    .from('enterprise_member_permissions')
    .select('permissions')
    .eq('enterprise_id', enterpriseId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberPerms?.permissions) {
    const permissions = memberPerms.permissions as string[];
    return permissions.includes(permission);
  }

  // 2. Fall back to role-level permissions
  const { data: rolePerms } = await client
    .from('enterprise_role_permissions')
    .select('permissions')
    .eq('enterprise_id', enterpriseId)
    .eq('role', 'member')
    .maybeSingle();

  if (!rolePerms?.permissions) return false;

  const permissions = rolePerms.permissions as string[];
  return permissions.includes(permission);
}

/**
 * Check if user is an admin (owner or admin role) for the enterprise.
 */
export async function isAdmin(userId: string, enterpriseId: string): Promise<boolean> {
  const role = await getUserRole(userId, enterpriseId);
  return role === 'owner' || role === 'admin';
}

/**
 * Standard unauthorized response
 */
export function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: '请先登录' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Permission denied response
 */
export function forbiddenResponse(permission?: string) {
  return new Response(
    JSON.stringify({ error: permission ? `没有 ${permission} 权限` : '没有操作权限' }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
