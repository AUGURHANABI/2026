import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthUser,
  getEnterpriseId,
  checkPermission,
  forbiddenResponse,
  checkLicenseExpired,
} from '@/shared/lib/auth-helpers';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';

// GET: 获取报价列表（支持搜索、分页）
export async function GET(req: NextRequest) {
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

  const client = getSupabaseClientOrThrow();

  // 解析查询参数
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');

  // 构建查询
  let query = client
    .from('product_quotations')
    .select('id, product_code, product_name, specifications, packaging_info, weight, dimensions, box_specs, created_at, updated_at', { count: 'exact' })
    .eq('enterprise_id', enterpriseId)
    .order('created_at', { ascending: false });

  // 搜索条件
  if (search) {
    query = query.or(`product_code.ilike.%${search}%,product_name.ilike.%${search}%`);
  }

  // 分页
  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: '获取报价列表失败' }, { status: 500 });
  }

  // 获取每个报价的价格区间
  const quotationsWithPrices = await Promise.all(
    (data || []).map(async (q) => {
      const { data: prices } = await client
        .from('product_price_ranges')
        .select('id, min_quantity, max_quantity, price, unit')
        .eq('quotation_id', q.id)
        .order('min_quantity', { ascending: true });
      return { ...q, price_ranges: prices || [] };
    })
  );

  return NextResponse.json({
    data: quotationsWithPrices,
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  });
}

// POST: 创建新报价
export async function POST(req: NextRequest) {
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
  const hasPermission = await checkPermission(user.id, enterpriseId, 'quotation:create');
  if (!hasPermission) {
    return forbiddenResponse('quotation:create');
  }

  const client = getSupabaseClientOrThrow();

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

    // 创建报价
    const { data: quotation, error: qError } = await client
      .from('product_quotations')
      .insert({
        enterprise_id: enterpriseId,
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
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single();

    if (qError || !quotation) {
      return NextResponse.json({ error: '创建报价失败' }, { status: 500 });
    }

    // 创建价格区间
    if (price_ranges && price_ranges.length > 0) {
      const priceInserts = price_ranges.map((pr: { min_quantity: number; max_quantity: number | null; price: number; unit: string }) => ({
        quotation_id: quotation.id,
        min_quantity: pr.min_quantity,
        max_quantity: pr.max_quantity,
        price: pr.price,
        unit: pr.unit || 'CNY',
      }));

      const { error: pError } = await client
        .from('product_price_ranges')
        .insert(priceInserts);

      if (pError) {
        // 回滚报价
        await client.from('product_quotations').delete().eq('id', quotation.id);
        return NextResponse.json({ error: '创建价格区间失败' }, { status: 500 });
      }
    }

    // 获取完整数据返回
    const { data: prices } = await client
      .from('product_price_ranges')
      .select('id, min_quantity, max_quantity, price, unit')
      .eq('quotation_id', quotation.id)
      .order('min_quantity', { ascending: true });

    return NextResponse.json({
      data: { ...quotation, price_ranges: prices || [] },
    });
  } catch {
    return NextResponse.json({ error: '请求处理失败' }, { status: 500 });
  }
}

// DELETE: 批量删除报价
export async function DELETE(req: NextRequest) {
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

  const client = getSupabaseClientOrThrow();

  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('ids');

    if (!ids) {
      return NextResponse.json({ error: '未提供要删除的ID' }, { status: 400 });
    }

    const idList = ids.split(',').filter(Boolean);

    // 删除（会级联删除价格区间）
    const { error } = await client
      .from('product_quotations')
      .delete()
      .in('id', idList)
      .eq('enterprise_id', enterpriseId);

    if (error) {
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedCount: idList.length });
  } catch {
    return NextResponse.json({ error: '删除请求处理失败' }, { status: 500 });
  }
}