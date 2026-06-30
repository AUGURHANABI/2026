'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useRef } from 'react';
import {
  fetchKnowledge,
  fetchCategories,
  fetchTags,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  fetchEntryVersions,
  importWord,
  downloadTemplate,
  fetchEntryComments,
  addEntryComment,
  deleteEntryComment,
  rateEntry,
  mergeCommentToAnswer,
  recordUsage,
  type KnowledgeEntry,
  type Category,
  type Tag,
  type EntryVersion,
  type EntryComment,
} from '@/lib/api';

export function KnowledgeList() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [expandedQuestion, setExpandedQuestion] = useState<string>('');

  // Group entries by question for display
  const groupedEntries = useMemo(() => {
    const groups: Array<{ question: string; entries: KnowledgeEntry[] }> = [];
    const map = new Map<string, KnowledgeEntry[]>();
    for (const entry of entries) {
      const key = entry.question.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, []);
        groups.push({ question: entry.question, entries: map.get(key)! });
      }
      map.get(key)!.push(entry);
    }
    return groups;
  }, [entries]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [versions, setVersions] = useState<EntryVersion[]>([]);

  // Form states
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formChangeNote, setFormChangeNote] = useState('');

  // Import states
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCategory, setImportCategory] = useState('');
  const [importTags, setImportTags] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total_parsed: number;
    imported: number;
    created: number;
    updated: number;
    skipped: number;
    entries: Array<{ id: string; question: string; answers_count?: number; action: 'created' | 'updated' | 'skipped' }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Copy states — 30秒内同一条目防重复
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const recentCopyRef = useRef<Map<string, number>>(new Map());

  // Comment & Rating states
  const [comments, setComments] = useState<EntryComment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [mergingCommentId, setMergingCommentId] = useState<string | null>(null);
  const [hoverScore, setHoverScore] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, catRes, tagRes] = await Promise.all([
        fetchKnowledge({
          search: search || undefined,
          category_id: filterCategory || undefined,
          tag_id: filterTag || undefined,
          page,
          page_size: 20,
        }),
        fetchCategories(),
        fetchTags(),
      ]);
      setEntries(entriesRes.data ?? []);
      setTotal(entriesRes.total ?? 0);
      setCategories(catRes.data ?? []);
      setTags(tagRes.data ?? []);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory, filterTag, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async () => {
    try {
      await createKnowledge({
        question: formQuestion,
        answer: formAnswer,
        category_id: formCategory || undefined,
        tag_ids: formTags,
      });
      setShowCreate(false);
      resetForm();
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleEdit = async () => {
    if (!selectedEntry) return;
    try {
      await updateKnowledge(selectedEntry.id, {
        question: formQuestion,
        answer: formAnswer,
        category_id: formCategory || undefined,
        tag_ids: formTags,
        change_note: formChangeNote || undefined,
      });
      setShowEdit(false);
      resetForm();
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条话术吗？')) return;
    try {
      await deleteKnowledge(id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 复制话术并记录使用次数（30秒防重复）
  const handleCopyAnswer = async (entry: KnowledgeEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(entry.answer);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 2000);

      // 30秒内同一条目不重复计数
      const now = Date.now();
      const lastCopy = recentCopyRef.current.get(entry.id);
      if (!lastCopy || now - lastCopy >= 30_000) {
        recentCopyRef.current.set(entry.id, now);
        recordUsage(entry.id).then((res) => {
          if (res.data.counted) {
            // 更新本地 usage_count
            setEntries((prev) =>
              prev.map((e) =>
                e.id === entry.id ? { ...e, usage_count: res.data.usage_count } : e
              )
            );
            if (selectedEntry?.id === entry.id) {
              setSelectedEntry((prev) =>
                prev ? { ...prev, usage_count: res.data.usage_count } : prev
              );
            }
          }
        }).catch(() => {/* 静默失败，不影响复制体验 */});
      }
    } catch {
      // clipboard API 不可用时静默失败
    }
  };

  // 用户选中文字后 Ctrl+C / 右键复制时触发，只记使用次数（不重复写剪贴板）
  const handleTextCopy = (entry: KnowledgeEntry) => {
    const now = Date.now();
    const lastCopy = recentCopyRef.current.get(entry.id);
    if (!lastCopy || now - lastCopy >= 30_000) {
      recentCopyRef.current.set(entry.id, now);
      recordUsage(entry.id).then((res) => {
        if (res.data.counted) {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id ? { ...e, usage_count: res.data.usage_count } : e
            )
          );
          if (selectedEntry?.id === entry.id) {
            setSelectedEntry((prev) =>
              prev ? { ...prev, usage_count: res.data.usage_count } : prev
            );
          }
        }
      }).catch(() => {/* 静默失败 */});
    }
  };

  const handleToggleActive = async (entry: KnowledgeEntry) => {
    try {
      await updateKnowledge(entry.id, { is_active: !entry.is_active });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
  };

  const openEdit = (entry: KnowledgeEntry) => {
    setSelectedEntry(entry);
    setFormQuestion(entry.question);
    setFormAnswer(entry.answer);
    setFormCategory(entry.category_id ?? '');
    setFormTags(entry.tags?.map((t) => t.id) ?? []);
    setFormChangeNote('');
    setShowEdit(true);
  };

  const openDetail = (entry: KnowledgeEntry) => {
    setSelectedEntry(entry);
    setComments([]);
    setCommentAuthor('');
    setCommentContent('');
    setHoverScore(0);
    loadComments(entry.id);
    setShowDetail(true);
  };

  const openVersions = async (entry: KnowledgeEntry) => {
    setSelectedEntry(entry);
    try {
      const res = await fetchEntryVersions(entry.id);
      setVersions(res.data ?? []);
      setShowVersions(true);
    } catch (err) {
      console.error('加载版本历史失败:', err);
    }
  };

  const resetForm = () => {
    setFormQuestion('');
    setFormAnswer('');
    setFormCategory('');
    setFormTags([]);
    setFormChangeNote('');
    setSelectedEntry(null);
  };

  const toggleTag = (tagId: string) => {
    setFormTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const toggleImportTag = (tagId: string) => {
    setImportTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await importWord({
        file: importFile,
        category_id: importCategory || undefined,
        tag_ids: importTags,
      });
      setImportResult(res.data);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const resetImportForm = () => {
    setImportFile(null);
    setImportCategory('');
    setImportTags([]);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadComments = async (entryId: string) => {
    try {
      const res = await fetchEntryComments(entryId);
      setComments(res.data ?? []);
    } catch (err) {
      console.error('加载评论失败:', err);
      setComments([]);
    }
  };

  const handleAddComment = async () => {
    if (!selectedEntry || !commentContent.trim()) return;
    setSubmittingComment(true);
    try {
      await addEntryComment(selectedEntry.id, {
        author: commentAuthor.trim() || undefined,
        content: commentContent.trim(),
      });
      setCommentContent('');
      await loadComments(selectedEntry.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '添加评论失败');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedEntry || !confirm('确定删除此评论？')) return;
    try {
      await deleteEntryComment(selectedEntry.id, commentId);
      await loadComments(selectedEntry.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除评论失败');
    }
  };

  const handleRate = async (score: number) => {
    if (!selectedEntry) return;
    try {
      await rateEntry(selectedEntry.id, score);
      setSelectedEntry({ ...selectedEntry, effectiveness_score: score });
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '评分失败');
    }
  };

  const handleMergeComment = async (commentId: string) => {
    if (!selectedEntry) return;
    setMergingCommentId(commentId);
    try {
      const res = await mergeCommentToAnswer(selectedEntry.id, commentId);
      // Update the selected entry with the new answer
      setSelectedEntry({
        ...selectedEntry,
        answer: res.data.new_answer,
        current_version: res.data.new_version,
      });
      await loadComments(selectedEntry.id);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '合并失败');
    } finally {
      setMergingCommentId(null);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">知识库管理</h2>
          <p className="text-sm text-slate-500 mt-1">管理和检索询盘话术，共 {total} 条</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { downloadTemplate(); }}
            className="border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            下载模板
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              resetImportForm();
              setShowImport(true);
            }}
            className="border-cyan-600 text-cyan-600 hover:bg-cyan-50"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            导入话术
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setShowCreate(true);
            }}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            + 新增话术
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="搜索问题或答案..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="bg-white"
          />
        </div>
        <Select
          value={filterCategory}
          onValueChange={(v) => {
            setFilterCategory(v === '__all__' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px] bg-white">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部分类</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterTag}
          onValueChange={(v) => {
            setFilterTag(v === '__all__' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px] bg-white">
            <SelectValue placeholder="全部标签" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部标签</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entry List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg p-6 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-slate-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg">暂无话术数据</p>
          <p className="text-sm mt-2">点击"新增话术"添加第一条询盘话术</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedEntries.map((group) => (
            <div key={group.question} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Question header - clickable to expand/collapse */}
              <button
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                onClick={() => setExpandedQuestion(expandedQuestion === group.question ? '' : group.question)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <svg
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expandedQuestion === group.question ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <h3 className="font-semibold text-slate-800 truncate">{group.question}</h3>
                  {!group.entries[0].is_active && group.entries.length === 1 && (
                    <Badge variant="secondary" className="text-xs shrink-0">已停用</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  {group.entries.length > 1 && (
                    <span className="text-xs text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">
                      {group.entries.length} 个回答
                    </span>
                  )}
                  {group.entries.length === 1 && (
                    <span className="text-xs text-slate-400">
                      使用 {group.entries[0].usage_count} 次
                    </span>
                  )}
                </div>
              </button>

              {/* Answer cards - shown when expanded or single answer */}
              <div className={`border-t border-slate-100 ${expandedQuestion === group.question || group.entries.length === 1 ? '' : 'hidden'}`}>
                {group.entries.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={`px-5 py-4 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  >
                    {group.entries.length > 1 && (
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded">
                          答案 {idx + 1}
                        </span>
                        {!entry.is_active && (
                          <Badge variant="secondary" className="text-xs">已停用</Badge>
                        )}
                      </div>
                    )}
                    <div className="relative group/answer isolate" onCopy={() => handleTextCopy(entry)}>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap pr-10 cursor-pointer hover:text-slate-800"
                         onClick={() => openDetail(entry)}
                      >
                        {entry.answer}
                      </p>
                      <button
                        onClick={(e) => handleCopyAnswer(entry, e)}
                        className="absolute top-0 right-0 opacity-0 group-hover/answer:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-cyan-50 text-slate-400 hover:text-cyan-600"
                        title="复制话术"
                      >
                        {copiedId === entry.id ? (
                          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.categories && (
                          <Badge variant="outline" className="text-xs">
                            {entry.categories.name}
                          </Badge>
                        )}
                        {entry.tags?.map((tag) => (
                          <Badge
                            key={tag.id}
                            className="text-xs text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </Badge>
                        ))}
                        <span className="text-xs text-slate-400">
                          使用 {entry.usage_count} 次 · 评分 {entry.effectiveness_score}/5
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(entry)}>编辑</Button>
                        <Button variant="ghost" size="sm" onClick={() => openVersions(entry)}>v{entry.current_version}</Button>
                        <Switch
                          checked={entry.is_active}
                          onCheckedChange={() => handleToggleActive(entry)}
                        />
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(entry.id)}>删除</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-slate-500">
            第 {page} / {totalPages} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增话术</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>问题 *</Label>
              <Input
                value={formQuestion}
                onChange={(e) => setFormQuestion(e.target.value)}
                placeholder="客户可能提出的询盘问题"
                className="mt-1"
              />
            </div>
            <div>
              <Label>回复话术 *</Label>
              <Textarea
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                placeholder="专业的询盘回复话术"
                rows={6}
                className="mt-1"
              />
            </div>
            <div>
              <Label>分类</Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">无分类</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>标签</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    className={`cursor-pointer transition-opacity ${
                      formTags.includes(tag.id) ? 'opacity-100' : 'opacity-40'
                    }`}
                    style={{ backgroundColor: tag.color, color: 'white' }}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              className="bg-cyan-600 hover:bg-cyan-700"
              onClick={handleCreate}
              disabled={!formQuestion || !formAnswer}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑话术</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>问题 *</Label>
              <Input
                value={formQuestion}
                onChange={(e) => setFormQuestion(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>回复话术 *</Label>
              <Textarea
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                rows={6}
                className="mt-1"
              />
            </div>
            <div>
              <Label>分类</Label>
              <Select value={formCategory || '__none__'} onValueChange={setFormCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">无分类</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>标签</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    className={`cursor-pointer transition-opacity ${
                      formTags.includes(tag.id) ? 'opacity-100' : 'opacity-40'
                    }`}
                    style={{ backgroundColor: tag.color, color: 'white' }}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>更新说明</Label>
              <Input
                value={formChangeNote}
                onChange={(e) => setFormChangeNote(e.target.value)}
                placeholder="描述本次修改内容"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>
              取消
            </Button>
            <Button
              className="bg-cyan-600 hover:bg-cyan-700"
              onClick={handleEdit}
              disabled={!formQuestion || !formAnswer}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>话术详情</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-5">
              {/* Question */}
              <div>
                <Label className="text-slate-500">问题</Label>
                <p className="mt-1 text-slate-800 font-medium">{selectedEntry.question}</p>
              </div>

              {/* Answer */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-slate-500">回复话术</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleCopyAnswer(selectedEntry)}
                  >
                    {copiedId === selectedEntry.id ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        已复制
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        复制话术
                      </>
                    )}
                  </Button>
                </div>
                <div className="mt-1 isolate">
                  <div className="p-3 bg-slate-50 rounded-lg text-slate-700 whitespace-pre-wrap text-sm leading-relaxed max-h-[300px] overflow-y-auto overflow-hidden" onCopy={() => handleTextCopy(selectedEntry)}>
                    {selectedEntry.answer}
                  </div>
                </div>
              </div>

              {/* Category & Status */}
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-slate-500">分类</Label>
                  <p className="mt-1">
                    {selectedEntry.categories ? (
                      <Badge variant="outline">{selectedEntry.categories.name}</Badge>
                    ) : (
                      <span className="text-slate-400">未分类</span>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">状态</Label>
                  <p className="mt-1">
                    <Badge variant={selectedEntry.is_active ? 'default' : 'secondary'}>
                      {selectedEntry.is_active ? '启用' : '停用'}
                    </Badge>
                  </p>
                </div>
              </div>

              {/* Tags */}
              <div>
                <Label className="text-slate-500">标签</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {selectedEntry.tags?.map((tag) => (
                    <Badge
                      key={tag.id}
                      className="text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                  {(!selectedEntry.tags || selectedEntry.tags.length === 0) && (
                    <span className="text-slate-400">无标签</span>
                  )}
                </div>
              </div>

              {/* Rating Section */}
              <div className="flex items-center gap-6">
                <div>
                  <Label className="text-slate-500">效果评分</Label>
                  <div className="flex items-center gap-1 mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        className="text-xl transition-colors focus:outline-none"
                        style={{
                          color: star <= (hoverScore || selectedEntry.effectiveness_score)
                            ? '#f59e0b'
                            : '#cbd5e1',
                        }}
                        onMouseEnter={() => setHoverScore(star)}
                        onMouseLeave={() => setHoverScore(0)}
                        onClick={() => handleRate(star)}
                        title={`评 ${star} 分`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="text-sm text-slate-500 ml-2">
                      {selectedEntry.effectiveness_score > 0
                        ? `${selectedEntry.effectiveness_score}/5`
                        : '未评分'}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-slate-400">
                  使用 {selectedEntry.usage_count} 次 · v{selectedEntry.current_version}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200" />

              {/* Comments Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-slate-700 font-medium">
                    评论区 ({comments.length})
                  </Label>
                </div>

                {/* Comment Input */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={commentAuthor}
                      onChange={(e) => setCommentAuthor(e.target.value)}
                      placeholder="你的名字（选填）"
                      className="w-[140px] text-sm"
                    />
                    <Input
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      placeholder="分享你的使用经验或建议..."
                      className="flex-1 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && commentContent.trim()) {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="bg-cyan-600 hover:bg-cyan-700 text-sm"
                      disabled={!commentContent.trim() || submittingComment}
                      onClick={handleAddComment}
                    >
                      {submittingComment ? '提交中...' : '发表评论'}
                    </Button>
                  </div>
                </div>

                {/* Comment List */}
                {comments.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    暂无评论，来分享你的使用经验吧
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[250px] overflow-y-auto">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`p-3 rounded-lg border ${
                          comment.is_merged
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-slate-700">
                                {comment.author}
                              </span>
                              <span className="text-xs text-slate-400">
                                {new Date(comment.created_at).toLocaleString('zh-CN')}
                              </span>
                              {comment.is_merged && (
                                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100 px-1.5 py-0">
                                  已合并到答案
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap isolate">
                              {comment.content}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {!comment.is_merged && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 text-xs h-7 px-2"
                                disabled={mergingCommentId === comment.id}
                                onClick={() => handleMergeComment(comment.id)}
                                title="将此评论内容追加到回复话术中"
                              >
                                {mergingCommentId === comment.id ? '合并中...' : (
                                  <>
                                    <svg className="w-3.5 h-3.5 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    合并到答案
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:text-red-600 hover:bg-red-50 text-xs h-7 px-2"
                              onClick={() => handleDeleteComment(comment.id)}
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Versions Dialog */}
      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>版本历史</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {versions.length === 0 ? (
              <p className="text-slate-400 text-center py-4">暂无版本记录</p>
            ) : (
              versions.map((v) => (
                <Card key={v.id} className="bg-slate-50">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Badge variant="outline">v{v.version}</Badge>
                      {v.change_note && (
                        <span className="text-slate-500 font-normal">{v.change_note}</span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-slate-500">问题: </span>
                        <span className="text-slate-700">{v.question}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">回复: </span>
                        <span className="text-slate-700 line-clamp-3 overflow-hidden isolate">{v.answer}</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {new Date(v.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) resetImportForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>导入话术</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Format guide */}
            <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 space-y-2">
              <p className="font-medium text-slate-700">支持的文件格式：</p>
              <div className="space-y-1.5">
                <p>1. <span className="font-mono text-xs bg-white px-1 rounded">.xlsx</span> Excel模板 — 推荐使用，同一问题可写多行不同答案</p>
                <p>2. <span className="font-mono text-xs bg-white px-1 rounded">.docx</span> Word文档 — 问题：/答案：标记、编号列表或表格</p>
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2">
                <p className="font-medium text-slate-700">Excel模板说明：</p>
                <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                  <li>第一列「问题」、第二列「答案」、第三列「分类」（可选）、第四列「标签」（可选，逗号分隔）</li>
                  <li>同一问题出现在多行时，各行的答案会合并为多个回答版本</li>
                  <li>点击上方「下载模板」获取标准模板文件</li>
                </ul>
              </div>
            </div>

            {/* File input */}
            <div>
              <Label>选择文件 *</Label>
              <div className="mt-1">
                <label
                  htmlFor="file-import"
                  className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    importFile ? 'border-cyan-500 bg-cyan-50' : 'border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  {importFile ? (
                    <div className="text-center">
                      <svg className="w-8 h-8 mx-auto mb-2 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm font-medium text-cyan-700">{importFile.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <svg className="w-8 h-8 mx-auto mb-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm text-slate-500">点击上传文件</p>
                      <p className="text-xs text-slate-400 mt-1">支持 .xlsx / .docx 格式</p>
                    </div>
                  )}
                  <input
                    id="file-import"
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setImportFile(file ?? null);
                      setImportResult(null);
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Category for imported entries */}
            <div>
              <Label>统一分类（可选）</Label>
              <Select value={importCategory} onValueChange={setImportCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="为导入的话术选择分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">不指定分类</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags for imported entries */}
            <div>
              <Label>统一标签（可选）</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    className={`cursor-pointer transition-opacity ${
                      importTags.includes(tag.id) ? 'opacity-100' : 'opacity-40'
                    }`}
                    style={{ backgroundColor: tag.color, color: 'white' }}
                    onClick={() => toggleImportTag(tag.id)}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Import result */}
            {importResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="font-medium text-emerald-800 mb-2">导入完成</p>
                <p className="text-sm text-emerald-700 mb-1">
                  从文件中解析出 <span className="font-semibold">{importResult.total_parsed}</span> 组问答
                </p>
                <div className="flex gap-4 text-sm">
                  <span className="text-cyan-700">新增 <span className="font-semibold">{importResult.created}</span></span>
                  <span className="text-amber-700">更新 <span className="font-semibold">{importResult.updated}</span></span>
                  <span className="text-slate-500">跳过 <span className="font-semibold">{importResult.skipped}</span></span>
                </div>
                {importResult.entries.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {importResult.entries.map((entry, i) => (
                      <p key={entry.id} className="text-xs truncate flex items-center gap-1.5">
                        <span className={
                          entry.action === 'created' ? 'text-cyan-600' :
                          entry.action === 'updated' ? 'text-amber-600' : 'text-slate-400'
                        }>
                          {i + 1}. {entry.question}
                        </span>
                        <span className={`shrink-0 inline-block px-1.5 py-0 rounded text-[10px] font-medium ${
                          entry.action === 'created' ? 'bg-cyan-100 text-cyan-700' :
                          entry.action === 'updated' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {entry.action === 'created' ? '新增' : entry.action === 'updated' ? '更新' : '跳过'}
                        </span>
                        {entry.answers_count && entry.answers_count > 1 && (
                          <span className="text-amber-600 shrink-0">({entry.answers_count}个版本)</span>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowImport(false)}
            >
              {importResult ? '关闭' : '取消'}
            </Button>
            {!importResult && (
              <Button
                className="bg-cyan-600 hover:bg-cyan-700"
                onClick={handleImport}
                disabled={!importFile || importing}
              >
                {importing ? '正在导入...' : '开始导入'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
