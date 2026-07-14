import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isDeveloper, getPermissionClient } from '@/shared/lib/auth-helpers';

// PUT /api/developer/enterprises/[id] - Update enterprise license (developer only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const dev = await isDeveloper(user.id);
  if (!dev) return NextResponse.json({ error: '仅开发者可访问' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { license_years, license_expires_at, name } = body as {
    license_years?: number;
    license_expires_at?: string | null;
    name?: string;
  };

  const client = getPermissionClient();
  if (!client) return NextResponse.json({ error: '服务错误' }, { status: 500 });

  // Build update object
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (name?.trim()) {
    updateData.name = name.trim();
  }

  // If license_years is provided, calculate expiration from now
  if (license_years !== undefined && license_years !== null) {
    const now = new Date();
    updateData.license_started_at = now.toISOString();
    updateData.license_expires_at = new Date(
      now.getTime() + license_years * 365.25 * 24 * 60 * 60 * 1000
    ).toISOString();
  } else if (license_expires_at !== undefined) {
    // Direct expiration date set
    updateData.license_expires_at = license_expires_at; // can be null for perpetual
  }

  const { data, error } = await client
    .from('enterprises')
    .update(updateData)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: '企业不存在' }, { status: 404 });

  return NextResponse.json({ data });
}

// DELETE /api/developer/enterprises/[id] - Delete enterprise (developer only)
export async function DELETE(
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

  const { error } = await client
    .from('enterprises')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
