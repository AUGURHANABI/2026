import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// Helper to verify session and get user
async function getAuthUser(req: NextRequest) {
  const token = req.headers.get('x-session');
  if (!token) return null;

  const client = getSupabaseClient(token);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET /api/enterprises/my - Get current user's enterprises
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const client = getSupabaseClient();

  // Get all enterprises the user belongs to
  const { data: memberships, error } = await client
    .from('enterprise_members')
    .select('enterprise_id, role, enterprises(id, name, invite_code)')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (memberships || []).map((m: Record<string, unknown>) => {
    const ent = Array.isArray(m.enterprises) ? m.enterprises[0] : m.enterprises as Record<string, unknown> | null;
    return {
      enterprise_id: m.enterprise_id as string,
      enterprise_name: ent?.name || '',
      invite_code: ent?.invite_code || '',
      role: m.role as string,
    };
  });

  return NextResponse.json({ data: result });
}

// POST /api/enterprises - Create a new enterprise
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const body = await req.json();
  const { name } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: '企业名称不能为空' }, { status: 400 });
  }

  const client = getSupabaseClient();

  // Generate a unique 6-character invite code
  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  let inviteCode = generateCode();
  // Ensure uniqueness
  let attempts = 0;
  while (attempts < 10) {
    const { data: existing } = await client
      .from('enterprises')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle();
    if (!existing) break;
    inviteCode = generateCode();
    attempts++;
  }

  // Create enterprise
  const { data: enterprise, error: createError } = await client
    .from('enterprises')
    .insert({
      name: name.trim(),
      invite_code: inviteCode,
      owner_id: user.id,
    })
    .select()
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  // Add creator as owner member
  const { error: memberError } = await client
    .from('enterprise_members')
    .insert({
      enterprise_id: enterprise.id,
      user_id: user.id,
      role: 'owner',
    });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      id: enterprise.id,
      name: enterprise.name,
      invite_code: enterprise.invite_code,
      role: 'owner',
    },
  });
}
