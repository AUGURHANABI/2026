import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthUser,
  getEnterpriseId,
  checkPermission,
  forbiddenResponse,
  checkLicenseExpired,
} from '@/lib/auth-helpers';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';

// POST: 导入报价数据
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
  const hasPermission = await checkPermission(user.id, enterpriseId, 'quotation:import');
  if (!hasPermission) {
    return forbiddenResponse('quotation:import');
  }

  const client = getSupabaseClientOrThrow();

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 });
    }

    // 读取文件内容
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return NextResponse.json({ error: '文件内容不足，至少需要标题行和一行数据' }, { status: 400 });
    }

    // 解析标题行
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    // 解析数据行
    const imported: Array<{ product_code: string; product_name: string }> = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));

      try {
        // 提取基本字段
        const product_code = values[0] || '';
        const product_name = values[1] || '';

        if (!product_code || !product_name) {
          errors.push({ row: i + 1, error: '产品货号和产品名称为必填项' });
          continue;
        }

        // 提取价格区间
        const priceRanges: Array<{ min_quantity: number; max_quantity: number | null; price: number; unit: string }> = [];
        for (let j = 0; j < 3; j++) {
          const baseIdx = 8 + j * 4;
          const minQty = parseInt(values[baseIdx]) || 1;
          const maxQty = values[baseIdx + 1] ? parseInt(values[baseIdx + 1]) : null;
          const price = parseFloat(values[baseIdx + 2]) || 0;
          const unit = values[baseIdx + 3] || 'CNY';

          if (price > 0) {
            priceRanges.push({ min_quantity: minQty, max_quantity: maxQty, price, unit });
          }
        }

        // 创建报价
        const { data: quotation, error: qError } = await client
          .from('product_quotations')
          .insert({
            enterprise_id: enterpriseId,
            product_code,
            product_name,
            specifications: values[2] || null,
            packaging_info: values[3] || null,
            weight: values[4] ? parseFloat(values[4]) : null,
            dimensions: values[5] || null,
            box_specs: values[6] || null,
            remarks_text: values[7] || null,
            remarks_images: [],
            remarks_attachments: [],
            created_by: user.id,
            updated_by: user.id,
          })
          .select()
          .single();

        if (qError || !quotation) {
          errors.push({ row: i + 1, error: '创建报价失败' });
          continue;
        }

        // 创建价格区间
        if (priceRanges.length > 0) {
          await client.from('product_price_ranges').insert(
            priceRanges.map(pr => ({
              quotation_id: quotation.id,
              ...pr,
            }))
          );
        }

        imported.push({ product_code, product_name });
      } catch (e) {
        errors.push({ row: i + 1, error: `解析失败: ${String(e)}` });
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: imported.length,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // 只返回前10个错误
    });
  } catch {
    return NextResponse.json({ error: '导入处理失败' }, { status: 500 });
  }
}