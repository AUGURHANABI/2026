import { NextRequest } from 'next/server';
import { getSupabaseClientOrThrow, getSupabaseCredentialsOrThrow, getSupabaseServiceRoleKey } from '@/storage/database/supabase-client';
import { createClient, User, SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Cached service client for permission checks (bypasses RLS)
let permissionServiceClient: SupabaseClient | null = null;

/**
 * Get a Supabase client that always uses the service role key,
 * ensuring RLS is bypassed for permission-related queries.
 */
export function getPermissionClient(): SupabaseClient | null {
  if (permissionServiceClient) return permissionServiceClient;

  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!serviceRoleKey) {
    // Fallback to the default admin client (may or may not bypass RLS)
    return getSupabaseClientOrThrow();
  }

  try {
    const creds = getSupabaseCredentialsOrThrow();
    permissionServiceClient = createClient(creds.url, serviceRoleKey, {
      db: { timeout: 15000 },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return permissionServiceClient;
  } catch {
    return getSupabaseClientOrThrow();
  }
}

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
  const client = getPermissionClient();
  if (!client) return null;
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

  const client = getPermissionClient();
  if (!client) return false;

  // 1. Check member-level override first
  try {
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
  } catch {
    // Table might not exist in production yet, fall through to role-level
  }

  // 2. Fall back to role-level permissions
  try {
    const { data: rolePerms } = await client
      .from('enterprise_role_permissions')
      .select('permissions')
      .eq('enterprise_id', enterpriseId)
      .eq('role', 'member')
      .maybeSingle();

    if (rolePerms?.permissions) {
      const permissions = rolePerms.permissions as string[];
      return permissions.includes(permission);
    }
  } catch {
    // Table might not exist in production yet
  }

  // 3. Hardcoded defaults if no permission data exists
  const defaultMemberPermissions = ['entry:create', 'entry:rate', 'qa:ask', 'quotation:create', 'quotation:export'];
  return defaultMemberPermissions.includes(permission);
}

/**
 * Check if user is an admin (owner or admin role) for the enterprise.
 */
export async function isAdmin(userId: string, enterpriseId: string): Promise<boolean> {
  const role = await getUserRole(userId, enterpriseId);
  return role === 'owner' || role === 'admin';
}

/**
 * Check if a user is a developer (can manage all enterprises).
 */
export async function isDeveloper(userId: string): Promise<boolean> {
  const client = getPermissionClient();
  if (!client) return false;
  try {
    const { data } = await client
      .from('developers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    return !!data;
  } catch {
    // Table might not exist
    return false;
  }
}

/**
 * Check if an enterprise's license is still active (not expired).
 * Returns true if license_expires_at is null (no expiration set) or in the future.
 */
export async function isLicenseActive(enterpriseId: string): Promise<{ active: boolean; expiresAt: string | null }> {
  const client = getPermissionClient();
  if (!client) return { active: true, expiresAt: null }; // If no client, assume active

  try {
    const { data } = await client
      .from('enterprises')
      .select('license_expires_at')
      .eq('id', enterpriseId)
      .maybeSingle();

    if (!data || !data.license_expires_at) {
      return { active: true, expiresAt: null }; // No expiration = perpetual license
    }

    const expiresAt = new Date(data.license_expires_at);
    const now = new Date();
    return { active: expiresAt > now, expiresAt: data.license_expires_at };
  } catch {
    return { active: true, expiresAt: null };
  }
}

/**
 * Check license and return expired response if inactive.
 * Usage: const licenseErr = await checkLicenseExpired(enterpriseId); if (licenseErr) return licenseErr;
 */
export async function checkLicenseExpired(enterpriseId: string): Promise<Response | null> {
  const license = await isLicenseActive(enterpriseId);
  if (!license.active) {
    return licenseExpiredResponse(license.expiresAt);
  }
  return null;
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

/**
 * Not found response
 */
export function notFoundResponse(message: string = '资源不存在') {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * License expired response
 */
export function licenseExpiredResponse(expiresAt: string | null) {
  const msg = expiresAt
    ? `企业授权已于 ${new Date(expiresAt).toLocaleDateString('zh-CN')} 到期，请联系管理员续期`
    : '企业授权已到期，请联系管理员续期';
  return new Response(
    JSON.stringify({ error: msg, code: 'LICENSE_EXPIRED' }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
