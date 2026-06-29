import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

/**
 * GET /api/knowledge/template
 * Download an Excel template for bulk importing knowledge entries.
 * Columns: 问题, 答案, 分类, 标签
 * Same question in multiple rows = multiple answer variations merged into one entry.
 */
export async function GET() {
  try {
    const headers = ['问题', '答案', '分类', '标签'];

    const sampleData = [
      ['客户觉得价格太高怎么办？', '感谢您对我们产品的关注。我们的定价反映了产品的高品质材料和严格的质量控制流程。如果您有较大的采购量，我们可以提供阶梯报价方案。', '价格谈判', '外贸,新客户'],
      ['客户觉得价格太高怎么办？', '我理解您的考量。相比同类产品，我们在原材料和售后方面有明显优势。能否告知您的预期采购量和预算范围？我们一起来找到最优方案。', '价格谈判', '内贸'],
      ['交期能否再快一些？', '标准产品可提供3-5个工作日的快速交付。定制产品加急可缩短至10个工作日，需额外支付8%加急费用。', '交期确认', '紧急,外贸'],
      ['你们的产品质量有保障吗？', '通过ISO 9001认证，每批次出厂均附带第三方检测报告。质保期18个月，质保期内免费更换。', '质量保证', 'VIP客户'],
    ];

    const wsData = [headers, ...sampleData];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // 问题
      { wch: 60 }, // 答案
      { wch: 15 }, // 分类
      { wch: 20 }, // 标签
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '话术导入模板');

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="inquiry_scripts_template.xlsx"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '生成模板失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
