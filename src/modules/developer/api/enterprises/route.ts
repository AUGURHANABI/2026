import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isDeveloper, getPermissionClient } from '@/shared/lib/auth-helpers';

// GET /api/developer/enterprises - List all enterprises (developer only)
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const dev = await isDeveloper(user.id);
  if (!dev) return NextResponse.json({ error: '仅开发者可访问' }, { status: 403 });

  const client = getPermissionClient();
  if (!client) return NextResponse.json({ error: '服务错误' }, { status: 500 });

  // Get all enterprises with member count
  const { data: enterprises, error } = await client
    .from('enterprises')
    .select('id, name, invite_code, owner_id, license_started_at, license_expires_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get member counts for each enterprise
  const { data: memberCounts } = await client
    .from('enterprise_members')
    .select('enterprise_id');

  // Count members per enterprise
  const countMap: Record<string, number> = {};
  for (const m of (memberCounts ?? [])) {
    const eid = m.enterprise_id as string;
    countMap[eid] = (countMap[eid] || 0) + 1;
  }

  // Get owner emails
  const ownerIds = (enterprises ?? []).map((e: Record<string, unknown>) => e.owner_id).filter(Boolean) as string[];
  let ownerEmails: Record<string, string> = {};
  if (ownerIds.length > 0) {
    try {
      const { getSupabaseAdminClient } = await import('@/storage/database/supabase-client');
      const adminClient = getSupabaseAdminClient();
      if (adminClient) {
        const { data: users } = await adminClient.auth.admin.listUsers();
        for (const u of (users?.users ?? [])) {
          if (ownerIds.includes(u.id)) {
            ownerEmails[u.id] = u.email || '';
          }
        }
      }
    } catch {
      // Ignore errors fetching user emails
    }
  }

  const result = (enterprises ?? []).map((e: Record<string, unknown>) => ({
    id: e.id,
    name: e.name,
    invite_code: e.invite_code,
    owner_id: e.owner_id,
    owner_email: ownerEmails[e.owner_id as string] || '',
    member_count: countMap[e.id as string] || 0,
    license_started_at: e.license_started_at,
    license_expires_at: e.license_expires_at,
    created_at: e.created_at,
    is_expired: e.license_expires_at ? new Date(e.license_expires_at as string) < new Date() : false,
  }));

  return NextResponse.json({ data: result });
}

// POST /api/developer/enterprises - Create enterprise with license (developer only)
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const dev = await isDeveloper(user.id);
  if (!dev) return NextResponse.json({ error: '仅开发者可访问' }, { status: 403 });

  const body = await req.json();
  const { name, license_years } = body as { name?: string; license_years?: number };

  if (!name?.trim()) return NextResponse.json({ error: '企业名称不能为空' }, { status: 400 });

  const client = getPermissionClient();
  if (!client) return NextResponse.json({ error: '服务错误' }, { status: 500 });

  // Generate invite code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let inviteCode = '';
  for (let i = 0; i < 6; i++) inviteCode += chars.charAt(Math.floor(Math.random() * chars.length));

  // Ensure uniqueness
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: existing } = await client
      .from('enterprises')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle();
    if (!existing) break;
    inviteCode = '';
    for (let i = 0; i < 6; i++) inviteCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const now = new Date();
  const licenseExpiresAt = license_years
    ? new Date(now.getTime() + license_years * 365.25 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: enterprise, error } = await client
    .from('enterprises')
    .insert({
      name: name.trim(),
      invite_code: inviteCode,
      owner_id: user.id,
      license_started_at: now.toISOString(),
      license_expires_at: licenseExpiresAt,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: enterprise });
}
