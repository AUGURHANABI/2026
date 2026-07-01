import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const client = getSupabaseClientOrThrow();

  let query = client.from('categories').select('*').order('sort_order', { ascending: true });
  if (!enterpriseId) {
    return NextResponse.json({ data: [] });
  }
  query = query.eq('enterprise_id', enterpriseId);

  const { data, error } = await query;
  if (error) throw new Error(`查询分类失败: ${error.message}`);
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
  }

  // Check permission: category:manage
  const canManage = await checkPermission(user.id, enterpriseId, 'category:manage');
  if (!canManage) return forbiddenResponse('category:manage');

  // License check
  const licenseErr = await checkLicenseExpired(enterpriseId);
  if (licenseErr) return licenseErr;

  const client = getSupabaseClientOrThrow();
  const body = await req.json();
  const { name, description, sort_order } = body;

  if (!name) {
    return NextResponse.json({ error: '分类名称不能为空' }, { status: 400 });
  }

  const insertData: Record<string, unknown> = { name, description, sort_order: sort_order ?? 0, enterprise_id: enterpriseId };

  const { data, error } = await client
    .from('categories')
    .insert(insertData)
    .select()
    .maybeSingle();

  if (error) throw new Error(`创建分类失败: ${error.message}`);
  return NextResponse.json({ data });
}
