import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const client = getSupabaseClientOrThrow();

  let query = client.from('tags').select('*').order('name', { ascending: true });
  if (!enterpriseId) {
    return NextResponse.json({ data: [] });
  }
  query = query.eq('enterprise_id', enterpriseId);

  const { data, error } = await query;
  if (error) throw new Error(`查询标签失败: ${error.message}`);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
  }

  // Check permission: tag:manage
  const canManage = await checkPermission(user.id, enterpriseId, 'tag:manage');
  if (!canManage) return forbiddenResponse('tag:manage');

  // License check
  const licenseErr = await checkLicenseExpired(enterpriseId);
  if (licenseErr) return licenseErr;

  const client = getSupabaseClientOrThrow();
  const body = await req.json();
  const { name, color } = body;

  if (!name) {
    return NextResponse.json({ error: '标签名称不能为空' }, { status: 400 });
  }

  const insertData: Record<string, unknown> = { name, color: color ?? '#0891b2', enterprise_id: enterpriseId };

  const { data, error } = await client
    .from('tags')
    .insert(insertData)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '标签名称已存在' }, { status: 409 });
    }
    throw new Error(`创建标签失败: ${error.message}`);
  }
  return NextResponse.json({ data });
}
