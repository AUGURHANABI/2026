'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useRef } from 'react';
import {
  fetchKnowledge,
  fetchCategories,
  fetchTags,
  createCategory,
  createTag,
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
  const [siblingEntries, setSiblingEntries] = useState<KnowledgeEntry[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
  const [commentAnonymous, setCommentAnonymous] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [mergingCommentId, setMergingCommentId] = useState<string | null>(null);
  const [hoverScore, setHoverScore] = useState(0);
  const [detailCategory, setDetailCategory] = useState<string | null>(null);
  const [detailTags, setDetailTags] = useState<string[]>([]);
  const [showCategoryPopover, setShowCategoryPopover] = useState(false);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);

  // Reply management states
  const [managingReplies, setManagingReplies] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyContent, setEditReplyContent] = useState('');
  const [savingReply, setSavingReply] = useState(false);
  const [showAddReply, setShowAddReply] = useState(false);
  const [newReplyContent, setNewReplyContent] = useState('');
  const [addingReply, setAddingReply] = useState(false);

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
        category_id: formCategory === '__none__' ? null : (formCategory || null),
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
        category_id: formCategory === '__none__' ? null : (formCategory || null),
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

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 条话术吗？`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteKnowledge(id)));
      setSelectedIds(new Set());
      setBatchMode(false);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '批量删除失败');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)));
    }
  };

  // 复制话术并记录使用次数（30秒防重复）
  const handleCopyAnswer = async (entry: KnowledgeEntry, answerIndex?: number, answerText?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const textToCopy = answerText || entry.answer;
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(answerIndex !== undefined ? `${entry.id}-${answerIndex}` : entry.id);
      setTimeout(() => setCopiedId(null), 2000);

      // 30秒内同一条目+同一回答不重复计数
      const now = Date.now();
      const dedupeKey = answerIndex !== undefined ? `${entry.id}-a${answerIndex}` : entry.id;
      const lastCopy = recentCopyRef.current.get(dedupeKey);
      if (!lastCopy || now - lastCopy >= 30_000) {
        recentCopyRef.current.set(dedupeKey, now);
        recordUsage(entry.id, answerIndex).then((res) => {
          if (res.data.counted) {
            const updateFn = (e: KnowledgeEntry) =>
              e.id === entry.id ? { ...e, usage_count: res.data.usage_count, answer_usage_counts: res.data.answer_usage_counts } : e;
            setEntries((prev) => prev.map(updateFn));
            if (selectedEntry?.id === entry.id) {
              setSelectedEntry((prev) =>
                prev ? { ...prev, usage_count: res.data.usage_count, answer_usage_counts: res.data.answer_usage_counts } : prev
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
          const updateFn = (e: KnowledgeEntry) =>
            e.id === entry.id ? { ...e, usage_count: res.data.usage_count, answer_usage_counts: res.data.answer_usage_counts } : e;
          setEntries((prev) => prev.map(updateFn));
          if (selectedEntry?.id === entry.id) {
            setSelectedEntry((prev) =>
              prev ? { ...prev, usage_count: res.data.usage_count, answer_usage_counts: res.data.answer_usage_counts } : prev
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

  const openDetail = (entry: KnowledgeEntry, question?: string) => {
    setSelectedEntry(entry);
    setComments([]);
    setCommentAuthor('');
    setCommentContent('');
    setCommentAnonymous(false);
    setManagingReplies(false);
    setEditingReplyId(null);
    setEditReplyContent('');
    setShowAddReply(false);
    setNewReplyContent('');
    setHoverScore(0);
    setDetailCategory(entry.category_id ?? null);
    setDetailTags(entry.tags?.map(t => t.id) ?? []);
    loadComments(entry.id);
    // Find sibling entries (same question)
    const q = question || entry.question;
    const siblings = entries.filter(e => e.question === q);
    setSiblingEntries(siblings);
    setShowDetail(true);
  };

  const handleDetailCategoryChange = async (categoryId: string | null) => {
    if (!selectedEntry) return;
    setDetailCategory(categoryId);
    try {
      await updateKnowledge(selectedEntry.id, {
        category_id: categoryId ?? null,
      });
      // Update local entries - find the category name for the updated entry
      const cat = categoryId ? categories.find(c => c.id === categoryId) : null;
      setEntries(prev => prev.map(e =>
        e.id === selectedEntry.id ? { ...e, category_id: categoryId ?? null, categories: cat ? { id: cat.id, name: cat.name } : null } : e
      ));
      setSelectedEntry(prev => prev ? { ...prev, category_id: categoryId ?? null, categories: cat ? { id: cat.id, name: cat.name } : null } : prev);
    } catch {
      // Revert on error
      setDetailCategory(selectedEntry.category_id ?? null);
    }
  };

  const handleCreateCategoryInline = async () => {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      const res = await createCategory({ name: newCategoryName.trim() });
      const created: Category = res.data;
      setCategories(prev => [...prev, created]);
      // Auto-select the newly created category
      await handleDetailCategoryChange(created.id);
      setNewCategoryName('');
      setShowCategoryPopover(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建分类失败');
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleCreateTagInline = async () => {
    if (!newTagName.trim() || !selectedEntry) return;
    setCreatingTag(true);
    try {
      const res = await createTag({ name: newTagName.trim() });
      const created: Tag = res.data;
      // Add to tags list
      const updatedAllTags = [...tags, created];
      setTags(updatedAllTags);
      // Auto-add the newly created tag
      const newTags = [...detailTags, created.id];
      setDetailTags(newTags);
      await updateKnowledge(selectedEntry.id, { tag_ids: newTags });
      const updatedEntryTags = updatedAllTags.filter(t => newTags.includes(t.id));
      setEntries(prev => prev.map(e =>
        e.id === selectedEntry.id ? { ...e, tags: updatedEntryTags } : e
      ));
      setSelectedEntry(prev => prev ? { ...prev, tags: updatedEntryTags } : prev);
      setNewTagName('');
      setShowTagPopover(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '创建标签失败');
    } finally {
      setCreatingTag(false);
    }
  };

  const handleRemoveCategory = () => {
    handleDetailCategoryChange(null);
  };

  const handleRemoveTag = (tagId: string) => {
    handleDetailTagToggle(tagId);
  };

  const handleDetailTagToggle = async (tagId: string) => {
    if (!selectedEntry) return;
    const newTags = detailTags.includes(tagId)
      ? detailTags.filter(id => id !== tagId)
      : [...detailTags, tagId];
    setDetailTags(newTags);
    try {
      await updateKnowledge(selectedEntry.id, {
        tag_ids: newTags,
      });
      // Update local entries - refresh tags
      const updatedTags = tags.filter(t => newTags.includes(t.id));
      setEntries(prev => prev.map(e =>
        e.id === selectedEntry.id ? { ...e, tags: updatedTags } : e
      ));
      setSelectedEntry(prev => prev ? { ...prev, tags: updatedTags } : prev);
    } catch {
      // Revert on error
      setDetailTags(selectedEntry.tags?.map(t => t.id) ?? []);
    }
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
        author: commentAnonymous ? undefined : (commentAuthor.trim() || undefined),
        content: commentContent.trim(),
        is_anonymous: commentAnonymous,
      });
      setCommentContent('');
      setCommentAnonymous(false);
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

  // Reply management handlers
  const handleStartEditReply = (entryId: string, content: string) => {
    setEditingReplyId(entryId);
    setEditReplyContent(content);
  };

  const handleSaveEditReply = async (entryId: string) => {
    if (!editReplyContent.trim()) return;
    setSavingReply(true);
    try {
      await updateKnowledge(entryId, { answer: editReplyContent.trim(), change_note: '编辑回复话术' });
      // Refresh data
      await loadData();
      // Re-open detail with updated entry
      const updated = entries.find(e => e.id === entryId);
      if (updated) {
        setSelectedEntry({ ...updated, answer: editReplyContent.trim() });
      }
      setEditingReplyId(null);
      setEditReplyContent('');
    } catch (err) {
      alert(err instanceof Error ? err.message : '编辑回复话术失败');
    } finally {
      setSavingReply(false);
    }
  };

  const handleDeleteReply = async (entryId: string) => {
    if (!confirm('确定删除此回复话术？')) return;
    try {
      await deleteKnowledge(entryId);
      await loadData();
      // Close detail if only one entry was left
      const remaining = entries.filter(e => e.question === selectedEntry?.question && e.id !== entryId);
      if (remaining.length === 0) {
        setShowDetail(false);
      } else {
        setSelectedEntry(remaining[0]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除回复话术失败');
    }
  };

  const handleAddReply = async () => {
    if (!selectedEntry || !newReplyContent.trim()) return;
    setAddingReply(true);
    try {
      await createKnowledge({
        question: selectedEntry.question,
        answer: newReplyContent.trim(),
        category_id: selectedEntry.category_id,
        tag_ids: selectedEntry.tags?.map(t => t.id) ?? [],
      });
      await loadData();
      setNewReplyContent('');
      setShowAddReply(false);
      // Refresh the detail view - find the new entry
      const res = await fetchKnowledge({ search: selectedEntry.question });
      const newEntry = (res.data ?? []).find((e: KnowledgeEntry) => e.question === selectedEntry.question && e.answer === newReplyContent.trim());
      if (newEntry) {
        openDetail(newEntry, newEntry.question);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '添加回复话术失败');
    } finally {
      setAddingReply(false);
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
          {batchMode ? (
            <>
              <Button
                variant="outline"
                onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}
                className="border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                取消
              </Button>
              <Button
                variant="outline"
                onClick={toggleSelectAll}
                className="border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                {selectedIds.size === entries.length ? '取消全选' : '全选'}
              </Button>
              <Button
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="bg-red-500 hover:bg-red-600 disabled:opacity-50"
              >
                删除选中 ({selectedIds.size})
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => setBatchMode(true)}
              className="border-slate-300 text-slate-600 hover:bg-slate-50"
            >
              批量管理
            </Button>
          )}
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
        <div className="space-y-3">
          {batchMode ? (
            /* 批量模式：每个条目独立一行，带复选框 */
            entries.map((entry) => (
              <div
                key={entry.id}
                className={`bg-white rounded-lg border px-5 py-4 flex items-center gap-3 transition-all ${
                  selectedIds.has(entry.id)
                    ? 'border-cyan-400 bg-cyan-50/30'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => toggleSelect(entry.id)}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 shrink-0"
                  checked={selectedIds.has(entry.id)}
                  onChange={() => toggleSelect(entry.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-800 truncate">{entry.question}</h3>
                  <p className="text-sm text-slate-500 truncate mt-0.5">{entry.answer}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {entry.categories && (
                    <Badge variant="outline" className="text-xs">{entry.categories!.name}</Badge>
                  )}
                  <span className="text-xs text-slate-400">使用 {entry.usage_count} 次</span>
                </div>
              </div>
            ))
          ) : (
            /* 正常模式：按问题分组，精简卡片 */
            groupedEntries.map((group) => (
              <div
                key={group.question}
                className="bg-white rounded-lg border border-slate-200 hover:border-cyan-200 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => openDetail(group.entries[0], group.question)}
              >
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <h3 className="font-medium text-slate-800 truncate">{group.question}</h3>
                    {!group.entries[0].is_active && (
                      <Badge variant="secondary" className="text-xs shrink-0">已停用</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {group.entries.length > 1 && (
                      <span className="text-xs text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full">
                        {group.entries.length} 个回复
                      </span>
                    )}
                    {group.entries[0].categories && (
                      <Badge variant="outline" className="text-xs">
                        {group.entries[0].categories!.name}
                      </Badge>
                    )}
                    {group.entries[0].tags?.slice(0, 2).map((tag) => (
                      <Badge
                        key={tag.id}
                        className="text-xs text-white"
                        style={{ backgroundColor: tag.color }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    <span className="text-xs text-slate-400">
                      使用 {group.entries.reduce((s, e) => s + e.usage_count, 0)} 次
                    </span>
                    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ))
          )}
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
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => {
            // Allow interaction with Popover content inside the Dialog
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-radix-popper-content-wrapper]')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>话术详情</DialogTitle>
          </DialogHeader>
          {selectedEntry && (() => {
            // Parse multi-answer patterns like "回答一：xxx 回答二：xxx"
            const parseAnswers = (text: string): string[] => {
              const patterns = [
                /回答[一二三四五六七八九十\d]+[：:]\s*/g,
                /答案[一二三四五六七八九十\d]+[：:]\s*/g,
                /回复话术[一二三四五六七八九十\d]+[：:]\s*/g,
                /答复[一二三四五六七八九十\d]+[：:]\s*/g,
              ];
              for (const pat of patterns) {
                const matches = [...text.matchAll(pat)];
                if (matches.length >= 2) {
                  const parts: string[] = [];
                  for (let i = 0; i < matches.length; i++) {
                    const start = matches[i].index! + matches[i][0].length;
                    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
                    parts.push(text.slice(start, end).trim());
                  }
                  return parts.filter(p => p.length > 0);
                }
              }
              return [text];
            };

            const sameQuestionEntries = entries.filter(e => e.question === selectedEntry.question);
            // For each entry, parse its answer into sub-answers
            const allAnswers: { entryId: string; entry: KnowledgeEntry; subIndex: number; content: string }[] = [];
            for (const entry of sameQuestionEntries) {
              const parts = parseAnswers(entry.answer);
              parts.forEach((content, idx) => {
                allAnswers.push({ entryId: entry.id, entry, subIndex: idx, content });
              });
            }
            const isMultiple = allAnswers.length > 1;
            return (
            <div className="space-y-5">
              {/* Question */}
              <div>
                <Label className="text-slate-500">问题</Label>
                <p className="mt-1 text-slate-800 font-medium">{selectedEntry.question}</p>
              </div>

              {/* Answers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-500">
                    回复话术（共 {allAnswers.length} 条）
                  </Label>
                  <Button
                    variant={managingReplies ? 'default' : 'outline'}
                    size="sm"
                    className={`h-7 text-xs gap-1 ${managingReplies ? 'bg-cyan-600 hover:bg-cyan-700' : 'text-cyan-600 border-cyan-200 hover:bg-cyan-50'}`}
                    onClick={() => {
                      setManagingReplies(!managingReplies);
                      setEditingReplyId(null);
                      setShowAddReply(false);
                    }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {managingReplies ? '完成管理' : '管理话术'}
                  </Button>
                </div>
                {allAnswers.map((ans, idx) => {
                  const isEditing = managingReplies && editingReplyId === ans.entryId;
                  return (
                  <div
                    key={`${ans.entryId}-${ans.subIndex}`}
                    className={`rounded-lg border p-4 space-y-3 ${
                      managingReplies
                        ? 'border-cyan-200 bg-cyan-50/30'
                        : isMultiple
                          ? 'border-slate-200 bg-white'
                          : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-cyan-600">
                        回复话术 {idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        {!managingReplies && (
                          <>
                            <span className="text-xs text-slate-400">使用 {ans.entry.answer_usage_counts?.[String(idx)] ?? 0} 次</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={(e) => handleCopyAnswer(ans.entry, idx, ans.content, e)}
                            >
                              {copiedId === `${ans.entry.id}-${idx}` ? (
                                <>
                                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                  已复制
                                </>
                              ) : (
                                <>
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                  复制
                                </>
                              )}
                            </Button>
                          </>
                        )}
                        {managingReplies && (
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  disabled={savingReply}
                                  onClick={() => handleSaveEditReply(ans.entryId)}
                                >
                                  {savingReply ? '保存中...' : '保存'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-slate-500 hover:bg-slate-100"
                                  onClick={() => { setEditingReplyId(null); setEditReplyContent(''); }}
                                >
                                  取消
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50"
                                  onClick={() => handleStartEditReply(ans.entryId, ans.entry.answer)}
                                >
                                  编辑
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-red-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => handleDeleteReply(ans.entryId)}
                                >
                                  删除
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <Textarea
                        value={editReplyContent}
                        onChange={(e) => setEditReplyContent(e.target.value)}
                        className="min-h-[120px] text-sm"
                        autoFocus
                      />
                    ) : (
                      <div className="isolate">
                        <div className="p-3 bg-slate-50 rounded-lg text-slate-700 whitespace-pre-wrap text-sm leading-relaxed overflow-hidden" onCopy={() => handleTextCopy(ans.entry)}>
                          {ans.content}
                        </div>
                      </div>
                    )}
                    {!managingReplies && isMultiple && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span
                              key={star}
                              className="text-sm"
                              style={{ color: star <= ans.entry.effectiveness_score ? '#f59e0b' : '#cbd5e1' }}
                            >
                              ★
                            </span>
                          ))}
                          <span className="text-xs text-slate-400 ml-1">
                            {ans.entry.effectiveness_score > 0 ? `${ans.entry.effectiveness_score}/5` : '未评分'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-slate-500 hover:text-cyan-600"
                            onClick={() => {
                              setShowDetail(false);
                              setTimeout(() => openEdit(ans.entry), 150);
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-400 hover:text-red-600"
                            onClick={() => handleDelete(ans.entry.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
                {/* Add new reply in manage mode */}
                {managingReplies && !showAddReply && (
                  <button
                    className="w-full py-3 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 hover:text-cyan-600 hover:border-cyan-300 transition-colors flex items-center justify-center gap-1"
                    onClick={() => setShowAddReply(true)}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    新增回复话术
                  </button>
                )}
                {managingReplies && showAddReply && (
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-cyan-600">新增回复话术</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-slate-500 hover:bg-slate-100"
                        onClick={() => { setShowAddReply(false); setNewReplyContent(''); }}
                      >
                        取消
                      </Button>
                    </div>
                    <Textarea
                      value={newReplyContent}
                      onChange={(e) => setNewReplyContent(e.target.value)}
                      placeholder="输入新的回复话术..."
                      className="min-h-[120px] text-sm"
                      autoFocus
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="bg-cyan-600 hover:bg-cyan-700 text-sm"
                        disabled={!newReplyContent.trim() || addingReply}
                        onClick={handleAddReply}
                      >
                        {addingReply ? '添加中...' : '添加话术'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Category & Status */}
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-slate-500">分类</Label>
                    <Popover open={showCategoryPopover} onOpenChange={setShowCategoryPopover}>
                      <PopoverTrigger asChild>
                        <button
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-50 text-cyan-600 hover:bg-cyan-100 transition-colors"
                          title="添加分类"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-72 p-2 z-[200]"
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <div className="space-y-1">
                          {categories.length > 0 && (
                            <>
                              <p className="text-xs text-slate-400 px-2 pt-1 pb-0.5">选择已有分类</p>
                              {categories.map((cat) => (
                                <button
                                  key={cat.id}
                                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-slate-100 transition-colors flex items-center justify-between ${
                                    detailCategory === cat.id ? 'bg-cyan-50 text-cyan-700 font-medium' : 'text-slate-700'
                                  }`}
                                  onClick={() => {
                                    handleDetailCategoryChange(cat.id);
                                    setShowCategoryPopover(false);
                                  }}
                                >
                                  {cat.name}
                                  {detailCategory === cat.id && (
                                    <svg className="w-3.5 h-3.5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                              <div className="border-t border-slate-100 my-1" />
                            </>
                          )}
                          <p className="text-xs text-slate-400 px-2 pt-1 pb-0.5">创建新分类</p>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              placeholder="输入分类名称"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newCategoryName.trim()) {
                                  handleCreateCategoryInline();
                                }
                              }}
                            />
                            <button
                              className="h-8 px-2 text-sm bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50 transition-colors"
                              disabled={!newCategoryName.trim() || creatingCategory}
                              onClick={handleCreateCategoryInline}
                            >
                              {creatingCategory ? '...' : '添加'}
                            </button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailCategory ? (
                      <div className="group relative inline-flex items-center">
                        <Badge
                          className="bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 transition-colors pr-6"
                        >
                          {categories.find(c => c.id === detailCategory)?.name || selectedEntry.categories?.name || '未知分类'}
                        </Badge>
                        <button
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-300 text-white hover:bg-red-400 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                          onClick={handleRemoveCategory}
                          title="移除分类"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">未分类</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-slate-500">状态</Label>
                  <p className="mt-2">
                    <Badge variant={selectedEntry.is_active ? 'default' : 'secondary'}>
                      {selectedEntry.is_active ? '启用' : '停用'}
                    </Badge>
                  </p>
                </div>
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-slate-500">标签</Label>
                  <Popover open={showTagPopover} onOpenChange={setShowTagPopover}>
                    <PopoverTrigger asChild>
                      <button
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-50 text-cyan-600 hover:bg-cyan-100 transition-colors"
                        title="添加标签"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-2 z-[200]"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <div className="space-y-1">
                        {tags.length > 0 && (
                          <>
                            <p className="text-xs text-slate-400 px-2 pt-1 pb-0.5">选择已有标签</p>
                            <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                              {tags.map((tag) => {
                                const isSelected = detailTags.includes(tag.id);
                                return (
                                  <button
                                    key={tag.id}
                                    className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full transition-colors ${
                                      isSelected
                                        ? 'text-white'
                                        : 'text-white/60 hover:text-white'
                                    }`}
                                    style={{ backgroundColor: tag.color }}
                                    onClick={() => handleDetailTagToggle(tag.id)}
                                  >
                                    {isSelected && (
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                    {tag.name}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="border-t border-slate-100 my-1" />
                          </>
                        )}
                        <p className="text-xs text-slate-400 px-2 pt-1 pb-0.5">创建新标签</p>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400"
                            placeholder="输入标签名称"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newTagName.trim()) {
                                handleCreateTagInline();
                              }
                            }}
                          />
                          <button
                            className="h-8 px-2 text-sm bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:opacity-50 transition-colors"
                            disabled={!newTagName.trim() || creatingTag}
                            onClick={handleCreateTagInline}
                          >
                            {creatingTag ? '...' : '添加'}
                          </button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detailTags.length > 0 ? (
                    detailTags.map((tagId) => {
                      const tag = tags.find(t => t.id === tagId);
                      if (!tag) return null;
                      return (
                        <div key={tag.id} className="group relative inline-flex items-center">
                          <Badge
                            className="text-white pr-5"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </Badge>
                          <button
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-400/80 text-white hover:bg-red-400 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                            onClick={() => handleRemoveTag(tag.id)}
                            title="移除标签"
                          >
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-sm text-slate-400">无标签</span>
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
                    {!commentAnonymous && (
                      <Input
                        value={commentAuthor}
                        onChange={(e) => setCommentAuthor(e.target.value)}
                        placeholder="你的名字（选填）"
                        className="w-[140px] text-sm"
                      />
                    )}
                    {commentAnonymous && (
                      <div className="w-[140px] flex items-center px-3 h-9 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-400">
                        匿名用户***
                      </div>
                    )}
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
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Switch
                        checked={commentAnonymous}
                        onCheckedChange={setCommentAnonymous}
                        className="data-[state=checked]:bg-slate-500"
                      />
                      <span className="text-xs text-slate-500">匿名评论</span>
                    </label>
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
                                {comment.is_anonymous ? '匿名用户***' : comment.author}
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
            );
          })()}
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
