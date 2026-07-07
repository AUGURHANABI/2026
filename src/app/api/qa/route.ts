import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';

// 判断是否为报价相关问题
function isPricingQuestion(question: string): boolean {
  const pricingKeywords = ['价格', '多少钱', '报价', '多少', '价位', '单价', '批发价', '成本', '费用'];
  const lowerQuestion = question.toLowerCase();
  return pricingKeywords.some(kw => lowerQuestion.includes(kw));
}

// 从问题中提取数量信息
function extractQuantity(question: string): number | null {
  // 匹配 "100个"、"100件"、"100套"、"100pcs" 等格式
  const match = question.match(/(\d+)(个|件|套|pcs| Pieces|件套)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
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

  // ========== 判断问题类型 ==========
  const isPricing = isPricingQuestion(question);
  const askedQuantity = extractQuantity(question);

  // ========== 搜索产品报价（报价类问题优先） ==========
  // 提取产品关键词：分离产品名、数量、单位
  // 先移除数量相关部分（如"200个"、"100套"）
  let cleanedQuestion = question
    .replace(/\d+(个|件|套|pcs|Pieces|件套)/gi, '') // 移除数量+单位
    .replace(/(价格|多少钱|报价|多少|价位|单价|批发价|成本|费用)/g, ''); // 移除报价关键词
  
  // 提取剩余的关键词
  const productKeywords = cleanedQuestion
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter((k: string) => k.length >= 2);

  console.log('报价搜索关键词:', productKeywords, '原问题:', question);

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
  }> | null = null;

  if (productKeywords.length > 0) {
    // 构建搜索条件 - 对每个关键词搜索产品名、货号、规格
    const searchPromises = productKeywords.map(async (keyword: string) => {
      const { data, error } = await client
        .from('product_quotations')
        .select('id, product_code, product_name, specifications, packaging_info, weight, dimensions, box_specs, remarks_text')
        .eq('enterprise_id', enterpriseId)
        .or(`product_name.ilike.%${keyword}%,product_code.ilike.%${keyword}%,specifications.ilike.%${keyword}%`)
        .limit(5);
      
      if (error) console.error('搜索关键词失败:', keyword, error.message);
      return data || [];
    });

    // 合并所有搜索结果（去重）
    const searchResults = await Promise.all(searchPromises);
    const allProducts = searchResults.flat();
    const uniqueProducts = allProducts.filter((p, i, arr) => 
      arr.findIndex(x => x.id === p.id) === i
    );

    console.log('AI报价查询 - enterprise_id:', enterpriseId, '关键词:', productKeywords, '找到产品:', uniqueProducts.length);

    // 如果找到产品，再查询价格区间
    if (uniqueProducts.length > 0) {
      const productIds = uniqueProducts.map(p => p.id);
      const { data: priceRanges, error: prError } = await client
        .from('product_price_ranges')
        .select('quotation_id, min_quantity, max_quantity, price, unit')
        .in('quotation_id', productIds);
      
      if (prError) console.error('查询价格区间失败:', prError.message);
      
      // 合并价格区间到产品
      products = uniqueProducts.map(p => ({
        ...p,
        price_ranges: priceRanges?.filter(pr => pr.quotation_id === p.id).map(pr => ({
          min_quantity: pr.min_quantity,
          max_quantity: pr.max_quantity,
          price: parseFloat(String(pr.price)) || 0,
          unit: pr.unit || 'CNY'
        })) || null
      }));
      
      console.log('AI报价查询 - 有价格的产品:', products?.filter(p => p.price_ranges && p.price_ranges.length > 0).length);
    } else {
      products = null;
    }
  }

  // ========== 报价类问题的特殊处理 ==========
  if (isPricing) {
    // 如果找到产品，构建报价响应
    if (products && products.length > 0) {
      // 找到匹配数量价格的产品
      const matchedProducts = products.filter(p => p.price_ranges && p.price_ranges.length > 0);
      
      if (matchedProducts.length > 0) {
        // 有价格数据的产品
        let pricingContext = '【产品报价信息】\n';
        matchedProducts.forEach((p, i) => {
          pricingContext += `\n产品${i + 1}: ${p.product_name}`;
          if (p.specifications) pricingContext += ` (${p.specifications})`;
          pricingContext += `\n货号: ${p.product_code}`;
          
          if (p.price_ranges && p.price_ranges.length > 0) {
            pricingContext += '\n价格区间:';
            p.price_ranges.forEach(pr => {
              const maxQty = pr.max_quantity ? `-${pr.max_quantity}` : '以上';
              pricingContext += `\n  - ${pr.min_quantity}${maxQty}件: ¥${pr.price}/${pr.unit}`;
            });
            
            // 如果用户问了具体数量，匹配最合适的区间
            if (askedQuantity) {
              const matchedRange = p.price_ranges.find(pr => 
                askedQuantity >= pr.min_quantity && (!pr.max_quantity || askedQuantity <= pr.max_quantity)
              );
              if (matchedRange) {
                const total = askedQuantity * matchedRange.price;
                pricingContext += `\n  ➤ ${askedQuantity}件对应价格: ¥${matchedRange.price}/${matchedRange.unit}，总价约 ¥${total.toFixed(2)}`;
              }
            }
          }
          
          if (p.packaging_info) pricingContext += `\n包装: ${p.packaging_info}`;
          if (p.dimensions) pricingContext += `\n尺寸: ${p.dimensions}`;
          if (p.box_specs) pricingContext += `\n箱规: ${p.box_specs}`;
          if (p.remarks_text) pricingContext += `\n备注: ${p.remarks_text}`;
        });

        const pricingPrompt = `你是产品报价助手。用户询问产品价格，请根据以下报价数据直接回复，不要延伸或添加市场信息。

回复格式：
1. 列出找到的产品及其价格区间
2. 如果用户指定了数量，给出对应价格和总价
3. 如果有备注信息，简要说明
4. 回复简洁，不要添加"受材质影响"等通用说明

${pricingContext}`;

        const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
        const config = new Config();
        const llmClient = new LLMClient(config, customHeaders);

        const messages = [
          { role: 'system' as const, content: pricingPrompt },
          { role: 'user' as const, content: question },
        ];

        const stream = llmClient.stream(messages, {
          model: 'doubao-seed-2-0-lite-260215',
          temperature: 0.3, // 降低温度使回复更精准
        });

        return createStreamingResponse(stream, client, enterpriseId, question, null);
      } else {
        // 有产品但无价格数据
        const noPricePrompt = `你是产品报价助手。用户询问产品价格，系统中找到以下产品但暂无定价信息：

找到的产品: ${products.map(p => `${p.product_name}${p.specifications ? ` (${p.specifications})` : ''} - 货号:${p.product_code}`).join('\n')}

请回复：找到该产品，但暂无价格数据，建议联系业务确认最新报价。不要添加市场价格估计或通用说明。`;

        const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
        const config = new Config();
        const llmClient = new LLMClient(config, customHeaders);

        const messages = [
          { role: 'system' as const, content: noPricePrompt },
          { role: 'user' as const, content: question },
        ];

        const stream = llmClient.stream(messages, {
          model: 'doubao-seed-2-0-lite-260215',
          temperature: 0.1,
        });

        return createStreamingResponse(stream, client, enterpriseId, question, null);
      }
    } else {
      // 未找到产品
      const notFoundPrompt = `你是产品报价助手。用户询问产品价格，但系统中未找到匹配的产品报价信息。

请简洁回复：未找到该产品报价信息，请确认产品名称是否正确，或联系业务部门添加报价数据。不要提供市场价格估计或通用说明。`;

      const customHeaders = HeaderUtils.extractForwardHeaders(req.headers);
      const config = new Config();
      const llmClient = new LLMClient(config, customHeaders);

      const messages = [
        { role: 'system' as const, content: notFoundPrompt },
        { role: 'user' as const, content: question },
      ];

      const stream = llmClient.stream(messages, {
        model: 'doubao-seed-2-0-lite-260215',
        temperature: 0.1,
      });

      return createStreamingResponse(stream, client, enterpriseId, question, null);
    }
  }

  // ========== 非报价问题：搜索知识库 ==========
  // 使用更灵活的搜索方式
  const searchTerms = question
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter((k: string) => k.length >= 2);
  
  let entries: Array<{
    id: string;
    question: string;
    answer: string;
    categories: Array<{ name: string }> | null;
  }> | null = null;
  
  if (searchTerms.length > 0) {
    // 对每个关键词搜索知识库
    const knowledgePromises = searchTerms.map(async (term: string) => {
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
    
    const knowledgeResults = await Promise.all(knowledgePromises);
    const allEntries = knowledgeResults.flat();
    
    // 去重
    entries = allEntries.filter((e, i, arr) => 
      arr.findIndex(x => x.id === e.id) === i
    );
    
    console.log('知识库搜索关键词:', searchTerms, '找到条目:', entries?.length || 0);
  } else {
    // 如果没有关键词，尝试用原始问题搜索
    const { data, error: searchError } = await client
      .from('knowledge_entries')
      .select('id, question, answer, categories(name)')
      .eq('is_active', true)
      .eq('enterprise_id', enterpriseId)
      .or(`question.ilike.%${question}%,answer.ilike.%${question}%`)
      .limit(3);
    
    if (searchError) console.error('搜索知识库失败:', searchError.message);
    entries = data;
  }

  // 搜索历史问答
  let historyEntries: Array<{ question: string; answer: string }> | null = null;
  if (searchTerms.length > 0) {
    const historyPromises = searchTerms.map(async (term: string) => {
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
    
    const historyResults = await Promise.all(historyPromises);
    const allHistory = historyResults.flat();
    historyEntries = allHistory.filter((h, i, arr) => 
      arr.findIndex(x => x.question === h.question) === i
    );
  }

  // ========== 构建上下文 ==========
  let context = '';
  let matchedEntryId: string | null = null;

  // 知识库上下文
  if (entries && entries.length > 0) {
    matchedEntryId = entries[0].id;
    context += '\n【知识库参考话术】\n';
    context += entries
      .map((e, i: number) =>
        `[参考${i + 1}] 分类: ${e.categories?.[0]?.name ?? '未分类'}\n问题: ${e.question}\n答案: ${e.answer}`
      )
      .join('\n\n');
  }

  // 产品信息（非报价查询时仅展示基本信息）
  if (products && products.length > 0) {
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

  // 历史问答上下文
  if (historyEntries && historyEntries.length > 0) {
    context += '\n\n【历史问答参考】\n';
    context += historyEntries
      .map((h, i: number) =>
        `[历史${i + 1}] 问: ${h.question}\n答: ${h.answer.slice(0, 200)}...`
      )
      .join('\n\n');
  }

  // ========== 构建系统提示（非报价模式） ==========
  const systemPrompt = `你是一位专业的询盘话术顾问，根据用户的问题提供精准回复。

回复要求：
1. 回复必须专业、礼貌，使用中文
2. 针对具体问题给出有针对性的回复
3. 如有参考信息，请结合参考但不要照搬
4. 语言简洁有力，避免冗长
5. 不要使用"Dear"等英文称呼，直接用中文问候语
${context ? `\n\n以下是从系统中匹配到的参考信息：\n${context}` : '\n\n注意：系统中暂无匹配的参考信息，请根据你的专业知识回复，或提示用户提供更多细节。'}`;

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

  return createStreamingResponse(stream, client, enterpriseId, question, matchedEntryId);
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