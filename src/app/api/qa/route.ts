import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';

// 判断是否为明确的报价问题（产品+数量+价格词组合）
function isExplicitPricingQuestion(question: string): boolean {
  // 必须同时满足：产品名相关 + 数量 + 价格关键词
  const hasQuantity = /\d+(个|件|套|pcs|Pieces|件套)/i.test(question);
  const hasPriceKeyword = /(价格|多少钱|报价|价位|单价|批发价)/.test(question);
  // "多少可以包邮" 等不是报价问题，是运费问题
  const isShippingQuestion = /(包邮|运费|快递|物流|发货|送货)/.test(question);
  
  // 只有有数量和价格关键词，且不是运费问题才算报价问题
  return hasQuantity && hasPriceKeyword && !isShippingQuestion;
}

// 从问题中提取数量信息
function extractQuantity(question: string): number | null {
  const match = question.match(/(\d+)(个|件|套|pcs| Pieces|件套)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// 提取搜索关键词
function extractKeywords(question: string): string[] {
  // 移除数量和常见无关词
  const cleanedQuestion = question
    .replace(/\d+(个|件|套|pcs|Pieces|件套)/gi, '')
    .replace(/(价格|多少钱|报价|价位|单价|批发价|成本|费用|可以|怎么|请问|你好|在吗|有没有|帮我|我想)/g, '');
  
  return cleanedQuestion
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter((k: string) => k.length >= 2);
}

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
    const licenseErr = await checkLicenseExpired(enterpriseId);
    if (licenseErr) return licenseErr;

    const canAsk = await checkPermission(user.id, enterpriseId, 'qa:ask');
    if (!canAsk) return forbiddenResponse('qa:ask');
  }

  const client = getSupabaseClientOrThrow();

  if (!enterpriseId) {
    return new Response(JSON.stringify({ error: '请先加入企业' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ========== 并行搜索知识库和产品 ==========
  const keywords = extractKeywords(question);
  const askedQuantity = extractQuantity(question);
  const isExplicitPricing = isExplicitPricingQuestion(question);

  console.log('问题分析:', { question, keywords, askedQuantity, isExplicitPricing });

  // 并行执行所有搜索
  const [knowledgeResults, productResults, historyResults] = await Promise.all([
    // 搜索知识库
    searchKnowledge(client, enterpriseId, keywords, question),
    // 搜索产品
    searchProducts(client, enterpriseId, keywords),
    // 搜索历史问答
    searchHistory(client, enterpriseId, keywords, question),
  ]);

  const entries = knowledgeResults;
  let products: Array<{
    id: string;
    product_code: string;
    product_name: string;
    specifications: string | null;
    packaging_info: string | null;
    weight: number | null;
    dimensions: string | null;
    box_specs: string | null;
    remarks_text: string | null;
    price_ranges: Array<{ min_quantity: number; max_quantity: number | null; price: number; unit: string }> | null;
  }> | null = productResults;
  const historyEntries = historyResults;

  // 如果找到产品，查询价格区间
  if (products && products.length > 0) {
    const productIds = products.map(p => p.id);
    const { data: priceRanges, error: prError } = await client
      .from('product_price_ranges')
      .select('quotation_id, min_quantity, max_quantity, price, unit')
      .in('quotation_id', productIds);
    
    if (prError) console.error('查询价格区间失败:', prError.message);
    
    products = products.map(p => ({
      ...p,
      price_ranges: priceRanges?.filter(pr => pr.quotation_id === p.id).map(pr => ({
        min_quantity: pr.min_quantity,
        max_quantity: pr.max_quantity,
        price: parseFloat(String(pr.price)) || 0,
        unit: pr.unit || 'CNY'
      })) || null
    }));
  }

  console.log('搜索结果:', {
    knowledgeCount: entries?.length || 0,
    productCount: products?.length || 0,
    historyCount: historyEntries?.length || 0
  });

  // ========== 构建上下文并判断回复策略 ==========
  let context = '';
  let matchedEntryId: string | null = null;
  let hasKnowledgeData = false;
  let hasProductData = false;
  let hasPriceData = false;

  // 知识库上下文
  if (entries && entries.length > 0) {
    matchedEntryId = entries[0].id;
    hasKnowledgeData = true;
    context += '\n【知识库参考话术】\n';
    context += entries
      .map((e, i: number) =>
        `[参考${i + 1}] 分类: ${e.categories?.[0]?.name ?? '未分类'}\n问题: ${e.question}\n答案: ${e.answer}`
      )
      .join('\n\n');
  }

  // 产品报价上下文
  if (products && products.length > 0) {
    hasProductData = true;
    const productsWithPrice = products.filter(p => p.price_ranges && p.price_ranges.length > 0);
    hasPriceData = productsWithPrice.length > 0;

    if (hasPriceData && isExplicitPricing) {
      // 报价问题且有价格数据 - 详细展示
      context += '\n\n【产品报价信息】\n';
      productsWithPrice.forEach((p, i) => {
        context += `\n产品${i + 1}: ${p.product_name}`;
        if (p.specifications) context += ` (${p.specifications})`;
        context += `\n货号: ${p.product_code}`;
        
        if (p.price_ranges && p.price_ranges.length > 0) {
          context += '\n价格区间:';
          p.price_ranges.forEach(pr => {
            const maxQty = pr.max_quantity ? `-${pr.max_quantity}` : '以上';
            context += `\n  - ${pr.min_quantity}${maxQty}件: ¥${pr.price}/${pr.unit}`;
          });
          
          if (askedQuantity) {
            const matchedRange = p.price_ranges.find(pr => 
              askedQuantity >= pr.min_quantity && (!pr.max_quantity || askedQuantity <= pr.max_quantity)
            );
            if (matchedRange) {
              const total = askedQuantity * matchedRange.price;
              context += `\n  ➤ ${askedQuantity}件对应价格: ¥${matchedRange.price}/${matchedRange.unit}，总价约 ¥${total.toFixed(2)}`;
            }
          }
        }
        
        if (p.packaging_info) context += `\n包装: ${p.packaging_info}`;
        if (p.dimensions) context += `\n尺寸: ${p.dimensions}`;
        if (p.box_specs) context += `\n箱规: ${p.box_specs}`;
        if (p.remarks_text) context += `\n备注: ${p.remarks_text}`;
      });
    } else if (hasProductData) {
      // 非报价问题但有产品信息 - 简要展示
      context += '\n\n【相关产品信息】\n';
      context += products
        .map((p, i) => {
          let info = `[产品${i + 1}] ${p.product_name}`;
          if (p.specifications) info += ` (${p.specifications})`;
          info += `\n货号: ${p.product_code}`;
          if (p.packaging_info) info += `\n包装: ${p.packaging_info}`;
          return info;
        })
        .join('\n\n');
    }
  }

  // 历史问答上下文
  if (historyEntries && historyEntries.length > 0) {
    context += '\n\n【历史问答参考】\n';
    context += historyEntries
      .map((h, i: number) =>
        `[历史${i + 1}] 问: ${h.question}\n答: ${h.answer.slice(0, 200)}...`
      )
      .join('\n\n');
  }

  // ========== 构建系统提示 ==========
  let systemPrompt: string;
  
  if (hasKnowledgeData || hasProductData) {
    // 有数据 - 基于数据回复
    systemPrompt = `你是一位专业的询盘话术顾问，根据用户的问题提供精准回复。

参考信息优先级：
1. 知识库话术 - 最权威，优先使用
2. 产品报价信息 - 如有匹配数量，给出对应价格
3. 历史问答参考 - 作为补充

回复要求：
1. 回复必须专业、礼貌，使用中文
2. 优先使用参考信息中的内容，但不要照搬，要适配用户的具体问题
3. 语言简洁有力，避免冗长
4. 不要使用"Dear"等英文称呼，直接用中文问候语

${context}`;
  } else {
    // 无数据 - AI合理发挥但需标注
    systemPrompt = `你是一位专业的询盘话术顾问。

注意：知识库中暂无相关资料，请根据你的专业知识给出合理的回复建议。

回复要求：
1. **必须在开头明确标注**："【知识库暂无相关资料，以下为AI建议，仅供参考】"
2. 回复专业、礼貌，使用中文
3. 给出合理的建议或通用话术参考
4. 最后可提示用户："如需更精准的回复，可将相关话术添加到知识库"
5. 不要使用"Dear"等英文称呼

用户问题：${question}`;
  }

  const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
  const config = new Config();
  const llmClient = new LLMClient(config, customHeaders);

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: question },
  ];

  const stream = llmClient.stream(messages, {
    model: 'doubao-seed-2-0-lite-260215',
    temperature: hasKnowledgeData || hasProductData ? 0.5 : 0.7,
  });

  return createStreamingResponse(stream, client, enterpriseId, question, matchedEntryId);
}

// 搜索知识库
async function searchKnowledge(
  client: ReturnType<typeof getSupabaseClientOrThrow>,
  enterpriseId: string,
  keywords: string[],
  question: string
): Promise<Array<{
  id: string;
  question: string;
  answer: string;
  categories: Array<{ name: string }> | null;
}> | null> {
  if (keywords.length > 0) {
    const promises = keywords.map(async (term: string) => {
      const { data, error } = await client
        .from('knowledge_entries')
        .select('id, question, answer, categories(name)')
        .eq('is_active', true)
        .eq('enterprise_id', enterpriseId)
        .or(`question.ilike.%${term}%,answer.ilike.%${term}%`)
        .limit(3);
      
      if (error) console.error('搜索知识库关键词失败:', term, error.message);
      return data || [];
    });
    
    const results = await Promise.all(promises);
    const allEntries = results.flat();
    return allEntries.filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i);
  }
  
  // 用原始问题搜索
  const { data, error } = await client
    .from('knowledge_entries')
    .select('id, question, answer, categories(name)')
    .eq('is_active', true)
    .eq('enterprise_id', enterpriseId)
    .or(`question.ilike.%${question}%,answer.ilike.%${question}%`)
    .limit(3);
  
  if (error) console.error('搜索知识库失败:', error.message);
  return data;
}

// 搜索产品
async function searchProducts(
  client: ReturnType<typeof getSupabaseClientOrThrow>,
  enterpriseId: string,
  keywords: string[]
): Promise<Array<{
  id: string;
  product_code: string;
  product_name: string;
  specifications: string | null;
  packaging_info: string | null;
  weight: number | null;
  dimensions: string | null;
  box_specs: string | null;
  remarks_text: string | null;
  price_ranges: Array<{ min_quantity: number; max_quantity: number | null; price: number; unit: string }> | null;
}> | null> {
  if (keywords.length === 0) return null;
  
  const promises = keywords.map(async (keyword: string) => {
    const { data, error } = await client
      .from('product_quotations')
      .select('id, product_code, product_name, specifications, packaging_info, weight, dimensions, box_specs, remarks_text')
      .eq('enterprise_id', enterpriseId)
      .or(`product_name.ilike.%${keyword}%,product_code.ilike.%${keyword}%,specifications.ilike.%${keyword}%`)
      .limit(5);
    
    if (error) console.error('搜索产品关键词失败:', keyword, error.message);
    return data || [];
  });
  
  const results = await Promise.all(promises);
  const allProducts = results.flat();
  // 添加 price_ranges: null 用于后续填充
  return allProducts.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i).map(p => ({
    ...p,
    price_ranges: null as Array<{ min_quantity: number; max_quantity: number | null; price: number; unit: string }> | null
  }));
}

// 搜索历史问答
async function searchHistory(
  client: ReturnType<typeof getSupabaseClientOrThrow>,
  enterpriseId: string,
  keywords: string[],
  question: string
): Promise<Array<{ question: string; answer: string }> | null> {
  if (keywords.length > 0) {
    const promises = keywords.map(async (term: string) => {
      const { data, error } = await client
        .from('qa_history')
        .select('question, answer')
        .eq('enterprise_id', enterpriseId)
        .or(`question.ilike.%${term}%,answer.ilike.%${term}%`)
        .order('created_at', { ascending: false })
        .limit(2);
      
      if (error) console.error('搜索历史问答失败:', term, error.message);
      return data || [];
    });
    
    const results = await Promise.all(promises);
    const allHistory = results.flat();
    return allHistory.filter((h, i, arr) => arr.findIndex(x => x.question === h.question) === i);
  }
  
  const { data, error } = await client
    .from('qa_history')
    .select('question, answer')
    .eq('enterprise_id', enterpriseId)
    .or(`question.ilike.%${question}%,answer.ilike.%${question}%`)
    .order('created_at', { ascending: false })
    .limit(2);
  
  if (error) console.error('搜索历史问答失败:', error.message);
  return data;
}

// 创建流式响应的辅助函数
function createStreamingResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: AsyncGenerator<any>,
  client: ReturnType<typeof getSupabaseClientOrThrow>,
  enterpriseId: string,
  question: string,
  matchedEntryId: string | null
) {
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

        // Save to QA history
        const historyInsert: Record<string, unknown> = {
          question,
          answer: fullAnswer,
          matched_entry_id: matchedEntryId,
          is_ai_generated: true,
          enterprise_id: enterpriseId,
        };

        client
          .from('qa_history')
          .insert(historyInsert)
          .then(({ error: historyError }) => {
            if (historyError) {
              console.error('保存问答历史失败:', historyError.message);
            }
          });

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