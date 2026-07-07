import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, getEnterpriseId, checkLicenseExpired, checkPermission } from '@/lib/auth-helpers';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';

// 解析 CSV 行，正确处理引号内的逗号
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 双引号转义
        current += '"';
        i++;
      } else {
        // 进入/退出引号模式
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // 逗号分隔符（不在引号内）
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// 解析 Excel HTML 格式 (.xls 文件，通常是 HTML 表格)
function parseExcelHTML(content: string): string[][] {
  const rows: string[][] = [];

  // 提取所有表格行
  const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(content)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];

    // 提取所有单元格 (td 或 th)
    const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      let cellContent = cellMatch[1];

      // 移除 HTML 标签，保留内容
      cellContent = cellContent
        .replace(/<br\s*\/?>/gi, '\n') // 将 <br/> 转换为换行
        .replace(/<[^>]+>/g, '') // 移除其他 HTML 标签
        .replace(/&nbsp;/g, ' ') // 替换 HTML 空格
        .replace(/&lt;/g, '<') // 替换 HTML 实体
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();

      cells.push(cellContent);
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

// 解析文件内容
async function parseFile(file: File): Promise<string[][]> {
  const fileName = file.name.toLowerCase();
  const content = await file.text();

  // 检测文件类型
  if (fileName.endsWith('.csv')) {
    // CSV 格式
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map(parseCSVLine);
  } else if (fileName.endsWith('.xls')) {
    // Excel HTML 格式
    return parseExcelHTML(content);
  } else if (fileName.endsWith('.xlsx')) {
    // XLSX 格式需要特殊处理，暂时不支持
    throw new Error('XLSX 格式暂不支持，请转换为 CSV 或 XLS 格式');
  } else {
    // 尝试检测内容格式
    if (content.includes('<table') || content.includes('<tr')) {
      return parseExcelHTML(content);
    } else {
      // 假设是 CSV
      const lines = content.split('\n').filter(line => line.trim());
      return lines.map(parseCSVLine);
    }
  }
}

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

  // 检查导入权限
  const hasPermission = await checkPermission(user.id, enterpriseId, 'quotation:import');
  if (!hasPermission) {
    return NextResponse.json({ error: '没有导入报价的权限' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: '请上传文件' }, { status: 400 });
  }

  try {
    const rows = await parseFile(file);

    if (rows.length < 2) {
      return NextResponse.json({ error: '文件内容不足，至少需要标题行和一行数据' }, { status: 400 });
    }

    // 第一行是标题
    const headers = rows[0];
    console.log('导入文件列数:', headers.length, '数据行数:', rows.length - 1);

    // 查找列索引（支持中文和英文列名）
    const findColumnIndex = (headerNames: string[]): number => {
      for (const name of headerNames) {
        const idx = headers.findIndex(h =>
          h.includes(name) || h.toLowerCase() === name.toLowerCase()
        );
        if (idx !== -1) return idx;
      }
      return -1;
    };

    // 列索引映射
    const colMap = {
      productCode: findColumnIndex(['产品货号', '货号', 'SKU', 'product_code', 'code']),
      productName: findColumnIndex(['产品名称', '名称', 'name', 'product_name']),
      specifications: findColumnIndex(['产品规格', '规格', 'specifications', 'spec']),
      packagingInfo: findColumnIndex(['包装信息', '包装', 'packaging', 'packaging_info']),
      weight: findColumnIndex(['重量', '重量(kg)', 'weight', 'kg']),
      dimensions: findColumnIndex(['尺寸', 'dimensions', 'size']),
      boxSpecs: findColumnIndex(['箱规', '箱规信息', 'box_specs', 'box']),
      remarks: findColumnIndex(['备注', 'remarks', 'note', '备注信息']),
      // 区间1
      range1Min: findColumnIndex(['数量区间1最小值', '区间1最小', 'range1_min', 'min1']),
      range1Max: findColumnIndex(['数量区间1最大值', '区间1最大', 'range1_max', 'max1']),
      range1Price: findColumnIndex(['区间1价格', '价格1', 'range1_price', 'price1']),
      range1Unit: findColumnIndex(['区间1货币', '货币1', 'range1_unit', 'unit1', '货币']),
      // 区间2
      range2Min: findColumnIndex(['数量区间2最小值', '区间2最小', 'range2_min', 'min2']),
      range2Max: findColumnIndex(['数量区间2最大值', '区间2最大', 'range2_max', 'max2']),
      range2Price: findColumnIndex(['区间2价格', '价格2', 'range2_price', 'price2']),
      range2Unit: findColumnIndex(['区间2货币', '货币2', 'range2_unit', 'unit2']),
      // 区间3
      range3Min: findColumnIndex(['数量区间3最小值', '区间3最小', 'range3_min', 'min3']),
      range3Max: findColumnIndex(['数量区间3最大值', '区间3最大', 'range3_max', 'max3']),
      range3Price: findColumnIndex(['区间3价格', '价格3', 'range3_price', 'price3']),
      range3Unit: findColumnIndex(['区间3货币', '货币3', 'range3_unit', 'unit3']),
    };

    console.log('列索引映射:', colMap);

    // 检查必需列
    if (colMap.productCode === -1) {
      return NextResponse.json({ error: '缺少必需列：产品货号' }, { status: 400 });
    }
    if (colMap.productName === -1) {
      return NextResponse.json({ error: '缺少必需列：产品名称' }, { status: 400 });
    }

    const client = getSupabaseClientOrThrow();
    let successCount = 0;
    const errors: string[] = [];
    const importedItems: Array<{ productCode: string; productName: string }> = [];

    // 处理数据行
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // 跳过空行
      if (!row || row.every(cell => !cell)) continue;

      try {
        const productCode = row[colMap.productCode] || '';
        const productName = row[colMap.productName] || '';

        if (!productCode || !productName) {
          errors.push(`第 ${i + 1} 行：产品货号或产品名称为空`);
          continue;
        }

        // 创建报价记录
        const quotationData = {
          enterprise_id: enterpriseId,
          product_code: productCode,
          product_name: productName,
          specifications: row[colMap.specifications] || null,
          packaging_info: row[colMap.packagingInfo] || null,
          weight: row[colMap.weight] ? parseFloat(row[colMap.weight]) : null,
          dimensions: row[colMap.dimensions] || null,
          box_specs: row[colMap.boxSpecs] || null,
          remarks_text: row[colMap.remarks] || null,
          created_by: user.id,
        };

        const { data: quotation, error: qError } = await client
          .from('product_quotations')
          .insert(quotationData)
          .select('id')
          .single();

        if (qError || !quotation) {
          errors.push(`第 ${i + 1} 行(${productCode})：创建失败 - ${qError?.message || '未知错误'}`);
          continue;
        }

        // 创建价格区间
        const priceRanges = [];

        // 区间1（必需）
        if (colMap.range1Min !== -1 && row[colMap.range1Min]) {
          priceRanges.push({
            quotation_id: quotation.id,
            min_quantity: parseInt(row[colMap.range1Min]) || 1,
            max_quantity: colMap.range1Max !== -1 ? (parseInt(row[colMap.range1Max]) || null) : null,
            price: parseFloat(row[colMap.range1Price]) || 0,
            unit: row[colMap.range1Unit] || 'CNY',
          });
        }

        // 区间2
        if (colMap.range2Min !== -1 && row[colMap.range2Min]) {
          priceRanges.push({
            quotation_id: quotation.id,
            min_quantity: parseInt(row[colMap.range2Min]) || 1,
            max_quantity: colMap.range2Max !== -1 ? (parseInt(row[colMap.range2Max]) || null) : null,
            price: parseFloat(row[colMap.range2Price]) || 0,
            unit: row[colMap.range2Unit] || 'CNY',
          });
        }

        // 区间3
        if (colMap.range3Min !== -1 && row[colMap.range3Min]) {
          priceRanges.push({
            quotation_id: quotation.id,
            min_quantity: parseInt(row[colMap.range3Min]) || 1,
            max_quantity: colMap.range3Max !== -1 ? (parseInt(row[colMap.range3Max]) || null) : null,
            price: parseFloat(row[colMap.range3Price]) || 0,
            unit: row[colMap.range3Unit] || 'CNY',
          });
        }

        if (priceRanges.length > 0) {
          const { error: pError } = await client
            .from('product_price_ranges')
            .insert(priceRanges);

          if (pError) {
            errors.push(`第 ${i + 1} 行(${productCode})：价格区间创建失败 - ${pError.message}`);
            // 删除已创建的报价记录
            await client.from('product_quotations').delete().eq('id', quotation.id);
            continue;
          }
        }

        successCount++;
        importedItems.push({ productCode, productName });
      } catch (err) {
        errors.push(`第 ${i + 1} 行：处理异常 - ${err instanceof Error ? err.message : '未知错误'}`);
      }
    }

    console.log(`导入完成：成功 ${successCount} 条，失败 ${errors.length} 条`);

    return NextResponse.json({
      message: `导入完成：成功 ${successCount} 条，失败 ${errors.length} 条`,
      successCount,
      errorCount: errors.length,
      errors: errors.slice(0, 20), // 只返回前20条错误
      importedItems: importedItems.slice(0, 10), // 返回前10条成功记录供参考
    });

  } catch (err) {
    console.error('导入处理错误:', err);
    return NextResponse.json({
      error: `导入失败：${err instanceof Error ? err.message : '处理文件时发生错误'}`,
    }, { status: 500 });
  }
}