import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getEnterpriseId, checkLicenseExpired } from '@/shared/lib/auth-helpers';

// 将值转换为 CSV 格式，必要时添加引号
function toCSVValue(value: string): string {
  // 如果值包含逗号、引号或换行符，需要用引号包裹
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    // 转义内部引号（双引号转义）
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// GET: 下载报价导入模板 (CSV格式)
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

  // 生成 CSV 模板内容
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

  // 示例数据（包含逗号的值展示正确的 CSV 格式）
  const exampleRow = [
    'SKU001',
    '硅胶密封圈',
    '直径50mm,厚度3mm',  // 包含逗号，会被引号包裹
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

  // 构建 CSV 内容
  const headerLine = headers.map(toCSVValue).join(',');
  const exampleLine = exampleRow.map(toCSVValue).join(',');
  const csvContent = `${headerLine}\n${exampleLine}`;

  // 返回 CSV 文件
  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8-sig', // utf-8-sig 添加 BOM，Excel 兼容
      'Content-Disposition': 'attachment; filename="quotation_template.csv"',
    },
  });
}