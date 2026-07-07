import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getEnterpriseId, checkLicenseExpired } from '@/lib/auth-helpers';

// GET: 下载报价导入模板 (Excel格式)
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

  // 生成简单的CSV模板内容（前端会转为Excel）
  const headers = [
    '产品货号*',
    '产品名称*',
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

  const exampleRow = [
    'SKU001',
    '硅胶密封圈',
    '直径50mm，厚度3mm',
    'PE袋包装',
    '0.05',
    '50x50x3mm',
    '100个/箱',
    '可定制尺寸',
    '1',
    '100',
    '2.5',
    'CNY',
    '101',
    '500',
    '2.0',
    'CNY',
    '501',
    '',
    '1.8',
    'CNY',
  ];

  const csvContent = [
    headers.join(','),
    exampleRow.join(','),
  ].join('\n');

  // 返回CSV，前端可以下载
  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="quotation_template.csv"',
    },
  });
}