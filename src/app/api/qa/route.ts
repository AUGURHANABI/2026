import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorizedResponse();

  const enterpriseId = await getEnterpriseId(req, user.id);
  const { question } = await req.json();

  if (!question) {
    return NextResponse.json({ error: '问题不能为空' }, { status: 400 });
  }

  // Check permission: qa:ask
  if (enterpriseId) {
    // License check
    const licenseErr = await checkLicenseExpired(enterpriseId);
    if (licenseErr) return licenseErr;

    const canAsk = await checkPermission(user.id, enterpriseId, 'qa:ask');
    if (!canAsk) return forbiddenResponse('qa:ask');
  }

  // Reuse a single client for all operations (no token = service role)
  const client = getSupabaseClientOrThrow();

  if (!enterpriseId) {
    return new Response(JSON.stringify({ error: '请先加入企业' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== 搜索知识库 ==========
  const knowledgeQuery = client
    .from('knowledge_entries')
    .select('id, question, answer, categories(name)')
    .eq('is_active', true)
    .eq('enterprise_id', enterpriseId)
    .or(`question.ilike.%${question}%,answer.ilike.%${question}%`)
    .limit(3);

  const { data: entries, error: searchError } = await knowledgeQuery;
  if (searchError) throw new Error(`搜索知识库失败: ${searchError.message}`);

  // ========== 搜索产品报价 ==========
  // 提取产品关键词（简单匹配：查找包含数字的产品名/货号）
  const productKeywords = question.replace(/[^\w\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter((k: string) => k.length >= 2);
  
  // 搜索产品：按产品名称或货号匹配
  let products: unknown[] | null = null;
  
  if (productKeywords.length > 0) {
    const orConditions = productKeywords
      .map((k: string) => `product_name.ilike.%${k}%,product_code.ilike.%${k}%,specifications.ilike.%${k}%`)
      .join(',');
    
    const { data, error: productError } = await client
      .from('product_quotations')
      .select(`
        id, product_code, product_name, specifications, packaging_info, 
        weight, dimensions, box_specs, remarks_text,
        price_ranges:min_quantity,max_quantity,price,unit
      `)
      .eq('enterprise_id', enterpriseId)
      .or(orConditions)
      .limit(5);
    
    if (productError) console.error('搜索产品失败:', productError.message);
    products = data;
  }

  // ========== 搜索历史问答 ==========
  const { data: historyEntries } = await client
    .from('qa_history')
    .select('question, answer')
    .eq('enterprise_id', enterpriseId)
    .or(`question.ilike.%${question}%,answer.ilike.%${question}%`)
    .order('created_at', { ascending: false })
    .limit(2);

  // ========== 构建上下文 ==========
  let context = '';
  let matchedEntryId: string | null = null;

  // 知识库上下文
  if (entries && entries.length > 0) {
    matchedEntryId = entries[0].id;
    context += '\n【知识库参考话术】\n';
    context += entries
      .map((e: Record<string, unknown>, i: number) =>
        `[参考${i + 1}] 分类: ${(e.categories as Record<string, string>)?.name ?? '未分类'}\n问题: ${(e as { question: string }).question}\n答案: ${(e as { answer: string }).answer}`
      )
      .join('\n\n');
  }

  // 产品报价上下文
  if (products && products.length > 0) {
    context += '\n\n【产品报价信息】\n';
    context += (products as Array<Record<string, unknown>>)
      .map((p, i) => {
        const product = p as {
          product_code: string;
          product_name: string;
          specifications: string | null;
          packaging_info: string | null;
          weight: number | null;
          dimensions: string | null;
          box_specs: string | null;
          remarks_text: string | null;
          price_ranges: Array<{ min_quantity: number; max_quantity: number | null; price: number; unit: string }> | null;
        };
        
        let info = `[产品${i + 1}] 货号: ${product.product_code}\n名称: ${product.product_name}`;
        if (product.specifications) info += `\n规格: ${product.specifications}`;
        if (product.packaging_info) info += `\n包装: ${product.packaging_info}`;
        if (product.weight) info += `\n重量: ${product.weight}kg`;
        if (product.dimensions) info += `\n尺寸: ${product.dimensions}`;
        if (product.box_specs) info += `\n箱规: ${product.box_specs}`;
        if (product.remarks_text) info += `\n备注: ${product.remarks_text}`;
        
        // 价格区间
        if (product.price_ranges && product.price_ranges.length > 0) {
          info += '\n价格区间:';
          product.price_ranges.forEach((pr, idx) => {
            const maxQty = pr.max_quantity ? `-${pr.max_quantity}` : '以上';
            info += `\n  - ${pr.min_quantity}${maxQty}件: ¥${pr.price}/${pr.unit}`;
          });
        }
        
        return info;
      })
      .join('\n\n');
  }

  // 历史问答上下文
  if (historyEntries && historyEntries.length > 0) {
    context += '\n\n【历史问答参考】\n';
    context += historyEntries
      .map((h: Record<string, unknown>, i: number) =>
        `[历史${i + 1}] 问: ${(h as { question: string }).question}\n答: ${(h as { answer: string }).answer.slice(0, 200)}...`
      )
      .join('\n\n');
  }

  // ========== 构建系统提示 ==========
  const systemPrompt = `你是一位专业的询盘话术顾问，同时也具备产品报价能力。你的任务是根据用户的问题，提供精准专业的询盘回复或报价信息。

能力范围：
1. **报价咨询** - 当用户询问产品价格时，参考产品报价信息，根据询问的数量给出对应价格区间
2. **产品信息** - 当用户询问产品规格、包装、尺寸等信息时，从产品报价中提取并呈现
3. **话术生成** - 当用户需要回复客户询盘时，生成专业、礼貌、有说服力的中文回复

报价规则：
- 根据用户提到的数量，匹配价格区间并报价
- 如果数量不在区间内，告知用户联系业务确认
- 报价时说明产品名称、规格、价格和单位

回复要求：
1. 回复必须专业、礼貌，使用中文
2. 针对具体问题给出有针对性的回复
3. 如有参考信息，请结合参考但不要照搬
4. 语言简洁有力，避免冗长
5. 不要使用"Dear"等英文称呼，直接用中文问候语
${context ? `\n\n以下是从系统中匹配到的参考信息：\n${context}` : '\n\n注意：系统中暂无匹配的参考信息，请根据你的专业知识回复，或提示用户提供更多细节。'}`;

  // Call LLM with streaming
  const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
  const config = new Config();
  const llmClient = new LLMClient(config, customHeaders);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: question },
  ];

  const stream = llmClient.stream(messages, {
    model: 'doubao-seed-2-0-lite-260215',
    temperature: 0.7,
  });

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let fullAnswer = '';
      try {
        for await (const chunk of stream) {
          if (chunk.content) {
            const text = chunk.content.toString();
            fullAnswer += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`)
            );
          }
        }

        // Save to QA history (enterprise-scoped) - fire and forget
        const historyInsert: Record<string, unknown> = {
          question,
          answer: fullAnswer,
          matched_entry_id: matchedEntryId,
          is_ai_generated: true,
          enterprise_id: enterpriseId,
        };

        // Non-blocking save
        client
          .from('qa_history')
          .insert(historyInsert)
          .then(({ error: historyError }) => {
            if (historyError) {
              console.error('保存问答历史失败:', historyError.message);
            }
          });

        // Update usage count for matched entry - fire and forget
        if (matchedEntryId) {
          client
            .rpc('increment_entry_usage', { entry_id: matchedEntryId })
            .then(({ error: usageError }) => {
              if (usageError) {
                console.error('更新使用次数失败:', usageError.message);
              }
            });
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (streamError) {
        const errorMessage = streamError instanceof Error ? streamError.message : '未知错误';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}