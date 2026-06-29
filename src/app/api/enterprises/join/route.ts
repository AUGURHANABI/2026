import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';

// POST /api/enterprises/join - Join an enterprise by invite code
export async function POST(req: NextRequest) {
  const token = req.headers.get('x-session');
  if (!token) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const client = getSupabaseClientOrThrow(token);
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: '认证失败' }, { status: 401 });
  }

  const body = await req.json();
  const { invite_code } = body;

  if (!invite_code || !invite_code.trim()) {
    return NextResponse.json({ error: '请输入邀请码' }, { status: 400 });
  }

  const serviceClient = getSupabaseClientOrThrow();

  // Find enterprise by invite code
  const { data: enterprise, error: findError } = await serviceClient
    .from('enterprises')
    .select('id, name, invite_code')
    .eq('invite_code', invite_code.trim().toUpperCase())
    .maybeSingle();

  if (findError || !enterprise) {
    return NextResponse.json({ error: '邀请码无效，请检查后重试' }, { status: 404 });
  }

  // Check if already a member
  const { data: existingMember } = await serviceClient
    .from('enterprise_members')
    .select('id, role')
    .eq('enterprise_id', enterprise.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingMember) {
    return NextResponse.json({
      data: {
        id: enterprise.id,
        name: enterprise.name,
        invite_code: enterprise.invite_code,
        role: existingMember.role,
      },
      message: '您已在该企业中',
    });
  }

  // Add as member
  const { error: joinError } = await serviceClient
    .from('enterprise_members')
    .insert({
      enterprise_id: enterprise.id,
      user_id: user.id,
      role: 'member',
    });

  if (joinError) {
    return NextResponse.json({ error: joinError.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      id: enterprise.id,
      name: enterprise.name,
      invite_code: enterprise.invite_code,
      role: 'member',
    },
  });
}
