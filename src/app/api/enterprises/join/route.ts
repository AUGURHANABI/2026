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

  // Strip all whitespace and non-alphanumeric characters, then uppercase
  const trimmedCode = (invite_code || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!trimmedCode) {
    return NextResponse.json({ error: '请输入邀请码' }, { status: 400 });
  }

  const serviceClient = getSupabaseClientOrThrow();

  // Find enterprise by invite code (case-insensitive)
  // Use .select() + take first instead of .maybeSingle() to avoid potential issues
  let enterprise: { id: string; name: string; invite_code: string } | null = null;
  let findError: string | null = null;

  // Try 1: ilike (case-insensitive)
  const { data: ilikeResults, error: ilikeError } = await serviceClient
    .from('enterprises')
    .select('id, name, invite_code')
    .ilike('invite_code', trimmedCode)
    .limit(1);

  if (ilikeError) {
    findError = ilikeError.message;
  } else if (ilikeResults && ilikeResults.length > 0) {
    enterprise = ilikeResults[0];
  }

  // Try 2: If ilike returned nothing, try exact match as fallback
  if (!enterprise && !findError) {
    const { data: eqResults, error: eqError } = await serviceClient
      .from('enterprises')
      .select('id, name, invite_code')
      .eq('invite_code', trimmedCode)
      .limit(1);

    if (eqError) {
      findError = eqError.message;
    } else if (eqResults && eqResults.length > 0) {
      enterprise = eqResults[0];
    }
  }

  if (!enterprise && !findError) {
    // Last resort: list all enterprises to check if table is accessible
    const { data: allEnts, error: listError } = await serviceClient
      .from('enterprises')
      .select('id, name, invite_code')
      .limit(10);

    console.error('[join] Both ilike and eq returned no results. All enterprises:', JSON.stringify(allEnts), 'listError:', listError?.message, 'searchCode:', trimmedCode);
  }

  if (findError) {
    console.error('[join] Error finding enterprise:', findError);
    return NextResponse.json({ error: '查询企业失败，请稍后重试' }, { status: 500 });
  }
  if (!enterprise) {
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
