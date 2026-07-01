import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientOrThrow } from '@/storage/database/supabase-client';
import { getAuthUser, getEnterpriseId, checkPermission, unauthorizedResponse, forbiddenResponse, checkLicenseExpired } from '@/lib/auth-helpers';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

interface ParsedEntry {
  question: string;
  answer: string;
  category?: string;
  tags?: string;
}

/**
 * Parse raw text from Word document into Q&A pairs.
 * Supports multiple formats:
 * 1. "问题：xxx\n答案：xxx" / "Q: xxx\nA: xxx"
 * 2. Numbered: "1. 问题\n答案" with blank-line separation
 * 3. Table format (two columns): first column = question, second = answer
 * 4. Heading + paragraph: heading as question, following paragraphs as answer
 */
function parseEntriesFromText(rawText: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = rawText.split('\n').map((l) => l.trim());

  // Strategy 1: Explicit Q&A markers (问题：/Q: + 答案：/A:)
  const qaPattern = /(?:问题[：:]\s*|Q[：:]\s*)([\s\S]*?)(?=(?:答案[：:]\s*|A[：:]\s*))([\s\S]*?)(?=(?:问题[：:]\s*|Q[：:]\s*)|$)/gi;
  let match: RegExpExecArray | null;
  let foundExplicit = false;

  while ((match = qaPattern.exec(rawText)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question && answer) {
      entries.push({ question, answer });
      foundExplicit = true;
    }
  }

  if (foundExplicit) return entries;

  // Strategy 2: Numbered items with blank-line separation
  const numberedPattern = /(?:^|\n\s*\n)(\d+[.、)）]\s*)([\s\S]*?)(?=(?:\n\s*\n\d+[.、)）])|$)/g;
  let numberedMatch: RegExpExecArray | null;
  let foundNumbered = false;

  while ((numberedMatch = numberedPattern.exec(rawText)) !== null) {
    const block = numberedMatch[2].trim();
    if (!block) continue;

    const firstBreakIdx = block.search(/\n/);
    if (firstBreakIdx > 0) {
      const question = block.substring(0, firstBreakIdx).trim();
      const answer = block.substring(firstBreakIdx + 1).trim();
      if (question && answer) {
        entries.push({ question, answer });
        foundNumbered = true;
      }
    }
  }

  if (foundNumbered) return entries;

  // Strategy 3: Double-newline separated blocks, first line = question, rest = answer
  const blocks = rawText.split(/\n\s*\n/).filter((b) => b.trim());
  for (const block of blocks) {
    const blockLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (blockLines.length >= 2) {
      const question = blockLines[0];
      const answer = blockLines.slice(1).join('\n');
      if (question.length >= 2 && answer.length >= 2) {
        entries.push({ question, answer });
      }
    }
  }

  return entries;
}

/**
 * Parse HTML from Word document (for table-based content).
 */
function parseEntriesFromHtml(html: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = tableRowPattern.exec(html)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowContent)) !== null) {
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      cells.push(text);
    }

    if (cells.length >= 2) {
      const question = cells[0];
      const answer = cells[1];
      if (question && answer) {
        entries.push({
          question,
          answer,
          category: cells[2] || undefined,
          tags: cells[3] || undefined,
        });
      }
    }
  }

  return entries;
}

/**
 * Parse Excel (.xlsx) file into Q&A pairs.
 * Columns: 问题, 答案, 分类, 标签
 * Same question in multiple rows → multiple answer variations merged.
 */
function parseEntriesFromXlsx(buffer: Buffer): ParsedEntry[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (rows.length < 2) return [];

  // First row is header
  const header = rows[0].map((h) => String(h ?? '').trim());
  const colQuestion = header.findIndex((h) => /问题|question/i.test(h));
  const colAnswer = header.findIndex((h) => /答案|answer/i.test(h));
  const colCategory = header.findIndex((h) => /分类|category/i.test(h));
  const colTags = header.findIndex((h) => /标签|tag/i.test(h));

  if (colQuestion < 0 || colAnswer < 0) return [];

  const entries: ParsedEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const question = String(row[colQuestion] ?? '').trim();
    const answer = String(row[colAnswer] ?? '').trim();
    if (!question || !answer) continue;

    entries.push({
      question,
      answer,
      category: colCategory >= 0 ? String(row[colCategory] ?? '').trim() || undefined : undefined,
      tags: colTags >= 0 ? String(row[colTags] ?? '').trim() || undefined : undefined,
    });
  }

  return entries;
}

/**
 * Merge entries with the same question: combine multiple answers into one entry.
 * Answers are joined with clear separators like "回答一：...\n\n回答二：..."
 */
function mergeSameQuestionEntries(entries: ParsedEntry[]): ParsedEntry[] {
  const grouped = new Map<string, { answers: string[]; category?: string; tags?: string }>();

  for (const entry of entries) {
    const key = entry.question.trim();
    if (!grouped.has(key)) {
      grouped.set(key, {
        answers: [],
        category: entry.category,
        tags: entry.tags,
      });
    }
    const group = grouped.get(key)!;
    group.answers.push(entry.answer);
    // Use the first non-empty category/tags
    if (!group.category && entry.category) group.category = entry.category;
    if (!group.tags && entry.tags) group.tags = entry.tags;
  }

  const merged: ParsedEntry[] = [];
  for (const [question, group] of grouped) {
    let answer: string;
    if (group.answers.length === 1) {
      answer = group.answers[0];
    } else {
      // Multiple answers for same question → merge with numbered labels
      answer = group.answers
        .map((a, i) => `回答${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][i] ?? (i + 1)}：${a}`)
        .join('\n\n');
    }
    merged.push({ question, answer, category: group.category, tags: group.tags });
  }

  return merged;
}

/**
 * Look up a category by name, return its ID if found.
 */
async function findCategoryIdByName(client: ReturnType<typeof getSupabaseClientOrThrow>, name: string): Promise<string | null> {
  const { data } = await client
    .from('categories')
    .select('id')
    .ilike('name', name)
    .maybeSingle();
  return data ? (data as Record<string, unknown>).id as string : null;
}

/**
 * Look up tags by comma-separated names, return their IDs.
 */
async function findTagIdsByNames(client: ReturnType<typeof getSupabaseClientOrThrow>, namesStr: string): Promise<string[]> {
  const names = namesStr.split(/[,，、]/).map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) return [];

  const { data } = await client
    .from('tags')
    .select('id, name')
    .in('name', names);

  if (!data) return [];
  return data.map((t: Record<string, unknown>) => t.id as string);
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const user = await getAuthUser(request);
    if (!user) {
      return unauthorizedResponse();
    }
    const enterpriseId = await getEnterpriseId(request, user.id);
    if (!enterpriseId) {
      return NextResponse.json({ error: '请先加入企业' }, { status: 403 });
    }

    // Check permission: entry:import
    const canImport = await checkPermission(user.id, enterpriseId, 'entry:import');
    if (!canImport) return forbiddenResponse('entry:import');

    // License check
    const licenseErr = await checkLicenseExpired(enterpriseId);
    if (licenseErr) return licenseErr;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const categoryId = formData.get('category_id') as string | null;
    const tagIdsRaw = formData.get('tag_ids') as string | null;

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const isXlsx = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc');

    if (!isXlsx && !isDocx) {
      return NextResponse.json(
        { error: '仅支持 .xlsx 和 .docx 格式的文件' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let entries: ParsedEntry[];

    if (isXlsx) {
      entries = parseEntriesFromXlsx(buffer);
    } else {
      // Word document
      const [textResult, htmlResult] = await Promise.all([
        mammoth.extractRawText({ buffer }),
        mammoth.convertToHtml({ buffer }),
      ]);

      const rawText = textResult.value;
      const html = htmlResult.value;

      entries = parseEntriesFromText(rawText);
      if (entries.length === 0) {
        entries = parseEntriesFromHtml(html);
      }
    }

    if (entries.length === 0) {
      return NextResponse.json(
        {
          error:
            '未能从文件中解析出问答对。请确保文件格式正确：\n1. Excel模板：问题、答案、分类（可选）、标签（可选）\n2. Word文档："问题：/答案：" 标记格式\n3. Word文档：编号列表或两列表格',
        },
        { status: 400 }
      );
    }

    // Merge same-question entries (multiple answers → one entry)
    entries = mergeSameQuestionEntries(entries);

    // Parse tag IDs from form
    const formTagIds = tagIdsRaw ? tagIdsRaw.split(',').filter(Boolean) : [];

    // Batch upsert entries into knowledge base
    const client = getSupabaseClientOrThrow();
    const resultEntries: Array<{ id: string; question: string; answers_count: number; action: 'created' | 'updated' | 'skipped' }> = [];

    for (const entry of entries) {
      // Resolve category: form override > spreadsheet column
      let resolvedCategoryId = categoryId || null;
      if (!resolvedCategoryId && entry.category) {
        resolvedCategoryId = await findCategoryIdByName(client, entry.category);
      }

      // Resolve tags: merge form tags + spreadsheet tags
      let resolvedTagIds = [...formTagIds];
      if (entry.tags) {
        const spreadsheetTagIds = await findTagIdsByNames(client, entry.tags);
        const merged = new Set([...resolvedTagIds, ...spreadsheetTagIds]);
        resolvedTagIds = [...merged];
      }

      // Count how many answers were merged for this entry
      const answersCount = (entry.answer.match(/回答[一二三四五六七八九十]+：/g) || []).length || 1;

      // Check if an entry with the same question AND answer already exists (within same enterprise)
      let existingQuery = client
        .from('knowledge_entries')
        .select('id, answer')
        .ilike('question', entry.question.trim())
        .ilike('answer', entry.answer.trim());
      if (!enterpriseId) {
        continue;
      }
      existingQuery = existingQuery.eq('enterprise_id', enterpriseId);
      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        // Same question + same answer → skip
        resultEntries.push({
          id: (existing as Record<string, unknown>).id as string,
          question: entry.question,
          answers_count: answersCount,
          action: 'skipped',
        });
        continue;
      }

      // Different question OR different answer → create new entry
      // (Same question with different answer will be grouped in the UI)
      const { data: newEntry, error: entryError } = await client
        .from('knowledge_entries')
        .insert({
          question: entry.question,
          answer: entry.answer,
          category_id: resolvedCategoryId,
          enterprise_id: enterpriseId,
          current_version: 1,
        })
        .select('id, question')
        .maybeSingle();

      if (entryError) {
        console.error('导入条目失败:', entryError.message);
        continue;
      }
      if (!newEntry) continue;

      const entryId = (newEntry as Record<string, unknown>).id as string;

      // Create initial version
      await client.from('entry_versions').insert({
        entry_id: entryId,
        version: 1,
        question: entry.question,
        answer: entry.answer,
        change_note: `通过${isXlsx ? 'Excel' : 'Word'}文档导入${answersCount > 1 ? `（含${answersCount}个回答版本）` : ''}`,
      });

      // Create tag associations
      if (resolvedTagIds.length > 0) {
        const tagRecords = resolvedTagIds.map((tagId) => ({
          entry_id: entryId,
          tag_id: tagId,
        }));
        await client.from('knowledge_entry_tags').insert(tagRecords);
      }

      resultEntries.push({
        id: entryId,
        question: (newEntry as Record<string, unknown>).question as string,
        answers_count: answersCount,
        action: 'created',
      });
    }

    const created = resultEntries.filter((e) => e.action === 'created').length;
    const skipped = resultEntries.filter((e) => e.action === 'skipped').length;

    return NextResponse.json({
      data: {
        total_parsed: entries.length,
        created,
        skipped,
        imported: created,
        entries: resultEntries,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '导入失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
