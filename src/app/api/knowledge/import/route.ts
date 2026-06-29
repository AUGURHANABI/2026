import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import mammoth from 'mammoth';

interface ParsedEntry {
  question: string;
  answer: string;
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
  // Match patterns like "1. question text\nanswer text" separated by blank lines
  const numberedPattern = /(?:^|\n\s*\n)(\d+[.、)）]\s*)([\s\S]*?)(?=(?:\n\s*\n\d+[.、)）])|$)/g;
  let numberedMatch: RegExpExecArray | null;
  let foundNumbered = false;

  while ((numberedMatch = numberedPattern.exec(rawText)) !== null) {
    const block = numberedMatch[2].trim();
    if (!block) continue;

    // Split block into question and answer by first line break
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

  // Try to extract from tables (two-column: question, answer)
  const tableRowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = tableRowPattern.exec(html)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowContent)) !== null) {
      // Strip HTML tags to get plain text
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
        entries.push({ question, answer });
      }
    }
  }

  return entries;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const categoryId = formData.get('category_id') as string | null;
    const tagIdsRaw = formData.get('tag_ids') as string | null;

    if (!file) {
      return NextResponse.json({ error: '请上传文件' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.docx') && !fileName.endsWith('.doc')) {
      return NextResponse.json(
        { error: '仅支持 .docx 格式的 Word 文件' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text and HTML from Word document
    const [textResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }),
    ]);

    const rawText = textResult.value;
    const html = htmlResult.value;

    // Try parsing from both text and HTML
    let entries = parseEntriesFromText(rawText);

    // If text parsing didn't yield results, try HTML (table-based)
    if (entries.length === 0) {
      entries = parseEntriesFromHtml(html);
    }

    if (entries.length === 0) {
      return NextResponse.json(
        {
          error:
            '未能从文档中解析出问答对。请确保文档格式为以下之一：\n1. "问题：xxx / 答案：xxx" 标记格式\n2. 编号列表格式（1. 问题，后跟答案）\n3. 两列表格（问题列 + 答案列）',
        },
        { status: 400 }
      );
    }

    // Parse tag IDs
    const tagIds = tagIdsRaw ? tagIdsRaw.split(',').filter(Boolean) : [];

    // Batch insert entries into knowledge base
    const client = getSupabaseClient();
    const createdEntries: Array<{ id: string; question: string }> = [];

    for (const entry of entries) {
      // Create knowledge entry
      const { data: newEntry, error: entryError } = await client
        .from('knowledge_entries')
        .insert({
          question: entry.question,
          answer: entry.answer,
          category_id: categoryId || null,
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
        change_note: '通过 Word 文档导入',
      });

      // Create tag associations
      if (tagIds.length > 0) {
        const tagRecords = tagIds.map((tagId) => ({
          entry_id: entryId,
          tag_id: tagId,
        }));
        await client.from('knowledge_entry_tags').insert(tagRecords);
      }

      createdEntries.push({
        id: entryId,
        question: (newEntry as Record<string, unknown>).question as string,
      });
    }

    return NextResponse.json({
      data: {
        total_parsed: entries.length,
        imported: createdEntries.length,
        entries: createdEntries,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '导入失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
