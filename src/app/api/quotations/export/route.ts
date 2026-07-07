import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthUser,
  getEnterpriseId,
  checkPermission,
  forbiddenResponse,
  checkLicenseExpired,
} from '@/lib/auth-helpers';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';

// GET: 导出报价数据为CSV
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

  // 检查权限
  const hasPermission = await checkPermission(user.id, enterpriseId, 'quotation:export');
  if (!hasPermission) {
    return forbiddenResponse('quotation:export');
  }

  const client = getSupabaseClientOrThrow();

  // 获取所有报价
  const { data: quotations, error: qError } = await client
    .from('product_quotations')
    .select('id, product_code, product_name, specifications, packaging_info, weight, dimensions, box_specs, remarks_text')
    .eq('enterprise_id', enterpriseId)
    .order('created_at', { ascending: false });

  if (qError) {
    return NextResponse.json({ error: '获取报价数据失败' }, { status: 500 });
  }

  // 获取每个报价的价格区间
  const quotationsWithPrices = await Promise.all(
    (quotations || []).map(async (q) => {
      const { data: prices } = await client
        .from('product_price_ranges')
        .select('min_quantity, max_quantity, price, unit')
        .eq('quotation_id', q.id)
        .order('min_quantity', { ascending: true });
      return { ...q, price_ranges: prices || [] };
    })
  );

  // 构建CSV内容
  const headers = [
    '产品货号',
    '产品名称',
    '产品规格',
    '包装信息',
    '重量(kg)',
    '尺寸',
    '箱规',
    '备注',
    '数量区间1最小值',
    '数量区间1最大值',
    '区间1价格',
    '区间1货币',
    '数量区间2最小值',
    '数量区间2最大值',
    '区间2价格',
    '区间2货币',
    '数量区间3最小值',
    '数量区间3最大值',
    '区间3价格',
    '区间3货币',
  ];

  const rows = quotationsWithPrices.map(q => {
    const row = [
      q.product_code,
      q.product_name,
      q.specifications || '',
      q.packaging_info || '',
      q.weight?.toString() || '',
      q.dimensions || '',
      q.box_specs || '',
      q.remarks_text || '',
    ];

    // 填充价格区间（最多3个）
    for (let i = 0; i < 3; i++) {
      const pr = q.price_ranges[i];
      if (pr) {
        row.push(
          pr.min_quantity.toString(),
          pr.max_quantity?.toString() || '',
          pr.price.toString(),
          pr.unit
        );
      } else {
        row.push('', '', '', '');
      }
    }

    return row.map(v => `"${v.replace(/"/g, '""')}"`).join(',');
  });

  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows,
  ].join('\n');

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="quotations_export.csv"',
    },
  });
}