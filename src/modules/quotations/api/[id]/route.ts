import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthUser,
  getEnterpriseId,
  checkPermission,
  forbiddenResponse,
  notFoundResponse,
  checkLicenseExpired,
} from '@/shared/lib/auth-helpers';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';

// GET: 获取单个报价详情
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '未找到企业' }, { status: 400 });
  }

  // 检查许可证
  const licenseErr = await checkLicenseExpired(enterpriseId);
  if (licenseErr) return licenseErr;

  const { id } = await params;
  const client = getSupabaseClientOrThrow();

  // 获取报价
  const { data: quotation, error: qError } = await client
    .from('product_quotations')
    .select('*')
    .eq('id', id)
    .eq('enterprise_id', enterpriseId)
    .maybeSingle();

  if (qError || !quotation) {
    return notFoundResponse('报价不存在');
  }

  // 获取价格区间
  const { data: priceRanges } = await client
    .from('product_price_ranges')
    .select('id, min_quantity, max_quantity, price, unit')
    .eq('quotation_id', id)
    .order('min_quantity', { ascending: true });

  return NextResponse.json({
    data: { ...quotation, price_ranges: priceRanges || [] },
  });
}

// PUT: 更新报价
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '未找到企业' }, { status: 400 });
  }

  // 检查许可证
  const licenseErr = await checkLicenseExpired(enterpriseId);
  if (licenseErr) return licenseErr;

  // 检查权限
  const hasPermission = await checkPermission(user.id, enterpriseId, 'quotation:edit');
  if (!hasPermission) {
    return forbiddenResponse('quotation:edit');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();

  // 验证报价存在且属于该企业
  const { data: existing, error: checkError } = await client
    .from('product_quotations')
    .select('id')
    .eq('id', id)
    .eq('enterprise_id', enterpriseId)
    .maybeSingle();

  if (checkError || !existing) {
    return notFoundResponse('报价不存在');
  }

  try {
    const body = await req.json();
    const {
      product_code,
      product_name,
      specifications,
      packaging_info,
      weight,
      dimensions,
      box_specs,
      remarks_text,
      remarks_images,
      remarks_attachments,
      price_ranges,
    } = body;

    // 验证必填字段
    if (!product_code || !product_name) {
      return NextResponse.json({ error: '产品货号和产品名称为必填项' }, { status: 400 });
    }

    // 更新报价
    const { data: quotation, error: qError } = await client
      .from('product_quotations')
      .update({
        product_code,
        product_name,
        specifications,
        packaging_info,
        weight,
        dimensions,
        box_specs,
        remarks_text,
        remarks_images: remarks_images || [],
        remarks_attachments: remarks_attachments || [],
        updated_by: user.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (qError) {
      return NextResponse.json({ error: '更新报价失败' }, { status: 500 });
    }

    // 更新价格区间：先删除旧的，再插入新的
    await client.from('product_price_ranges').delete().eq('quotation_id', id);

    if (price_ranges && price_ranges.length > 0) {
      const priceInserts = price_ranges.map((pr: { min_quantity: number; max_quantity: number | null; price: number; unit: string }) => ({
        quotation_id: id,
        min_quantity: pr.min_quantity,
        max_quantity: pr.max_quantity,
        price: pr.price,
        unit: pr.unit || 'CNY',
      }));

      const { error: pError } = await client
        .from('product_price_ranges')
        .insert(priceInserts);

      if (pError) {
        return NextResponse.json({ error: '更新价格区间失败' }, { status: 500 });
      }
    }

    // 获取完整数据返回
    const { data: prices } = await client
      .from('product_price_ranges')
      .select('id, min_quantity, max_quantity, price, unit')
      .eq('quotation_id', id)
      .order('min_quantity', { ascending: true });

    return NextResponse.json({
      data: { ...quotation, price_ranges: prices || [] },
    });
  } catch {
    return NextResponse.json({ error: '请求处理失败' }, { status: 500 });
  }
}

// DELETE: 删除单个报价
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 });
  }

  const enterpriseId = await getEnterpriseId(req, user.id);
  if (!enterpriseId) {
    return NextResponse.json({ error: '未找到企业' }, { status: 400 });
  }

  // 检查许可证
  const licenseErr = await checkLicenseExpired(enterpriseId);
  if (licenseErr) return licenseErr;

  // 检查权限
  const hasPermission = await checkPermission(user.id, enterpriseId, 'quotation:delete');
  if (!hasPermission) {
    return forbiddenResponse('quotation:delete');
  }

  const { id } = await params;
  const client = getSupabaseClientOrThrow();

  // 删除（会级联删除价格区间）
  const { error } = await client
    .from('product_quotations')
    .delete()
    .eq('id', id)
    .eq('enterprise_id', enterpriseId);

  if (error) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}