import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

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

  if (!DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: '请在 Vercel 环境变量中配置 DEEPSEEK_API_KEY' },
      { status: 500 }
    );
  }

  const client = getSupabaseClientOrThrow();

  // Search for matching knowledge entries
  let searchQuery = client
    .from('knowledge_entries')
    .select('id, question, answer, categories(name)')
    .eq('is_active', true)
    .or(`question.ilike.%${question}%,answer.ilike.%${question}%`)
    .limit(3);
  if (!enterpriseId) {
    return new Response(JSON.stringify({ error: '请先加入企业' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  searchQuery = searchQuery.eq('enterprise_id', enterpriseId);

  const { data: entries } = await searchQuery;

  // Build context from matched entries
  let context = '';
  let matchedEntryId: string | null = null;

  if (entries && entries.length > 0) {
    matchedEntryId = entries[0].id;
    context = entries
      .map(
        (e: Record<string, unknown>, i: number) =>
          `[参考${i + 1}] 分类: ${(e.categories as Record<string, string>)?.name ?? '未分类'}\n问题: ${e.question}\n答案: ${e.answer}`
      )
      .join('\n\n');
  }

  const systemPrompt = `你是一位专业的询盘话术顾问。你的任务是根据用户的问题，生成精准且专业的询盘回复话术。

要求：
1. 回复必须专业、礼貌、有说服力，使用中文
2. 针对客户的具体问题给出有针对性的回复
3. 如果有参考话术，请结合参考话术进行优化，但不要照搬
4. 回复应包含：问候/确认、核心回复、引导下一步行动
5. 语言简洁有力，避免冗长
6. 不要使用"Dear"等英文称呼，直接用中文问候语
7. 如果适合，可以给出2-3个不同角度的回复版本供选择${context ? `\n\n以下是从知识库中匹配到的参考话术：\n${context}` : '\n\n注意：知识库中暂无匹配的参考话术，请根据你的专业知识生成回复。'}`;

  // Call DeepSeek API with streaming (OpenAI-compatible)
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      let fullAnswer = '';
      try {
        const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question },
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 2048,
          }),
        });

        if (!response.ok) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: `API 请求失败 (${response.status})` })}\n\n`)
          );
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: '无法读取响应流' })}\n\n`)
          );
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullAnswer += content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              } catch {
                // skip parse errors
              }
            }
          }
        }

        // Save to QA history - fire and forget
        const historyInsert: Record<string, unknown> = {
          question,
          answer: fullAnswer,
          matched_entry_id: matchedEntryId,
          is_ai_generated: true,
        };
        if (enterpriseId) {
          historyInsert.enterprise_id = enterpriseId;
        }

        // Use void with then() for fire-and-forget (avoids TypeScript catch() issue)
        void client.from('qa_history').insert(historyInsert).then(() => {});

        // Update usage count for matched entry
        if (matchedEntryId) {
          void client
            .from('knowledge_entries')
            .select('usage_count')
            .eq('id', matchedEntryId)
            .maybeSingle()
            .then(({ data: entry }) => {
              if (entry) {
                void client
                  .from('knowledge_entries')
                  .update({ usage_count: (entry.usage_count as number) + 1 })
                  .eq('id', matchedEntryId)
                  .then(() => {});
              }
            });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, matched_entry_id: matchedEntryId })}\n\n`)
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : '生成回复失败';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
