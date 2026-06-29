'use client';

import { useState, useEffect, useCallback } from 'react';
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
  type KnowledgeEntry,
  type Category,
  type Tag,
  type EntryVersion,
} from '@/lib/api';

export function KnowledgeList() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
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
    entries: Array<{ id: string; question: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            onClick={() => {
              resetImportForm();
              setShowImport(true);
            }}
            className="border-cyan-600 text-cyan-600 hover:bg-cyan-50"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            导入 Word
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
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card
              key={entry.id}
              className={`bg-white hover:shadow-md transition-shadow cursor-pointer border-l-4 ${
                entry.is_active ? 'border-l-cyan-500' : 'border-l-slate-300'
              }`}
              onClick={() => openDetail(entry)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-semibold text-slate-800 truncate">
                        {entry.question}
                      </h3>
                      {!entry.is_active && (
                        <Badge variant="secondary" className="text-xs">已停用</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2">
                      {entry.answer}
                    </p>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
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
                      <span className="text-xs text-slate-400 ml-2">
                        使用 {entry.usage_count} 次 · 评分 {entry.effectiveness_score}/5
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(entry)}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openVersions(entry)}
                    >
                      v{entry.current_version}
                    </Button>
                    <Switch
                      checked={entry.is_active}
                      onCheckedChange={() => handleToggleActive(entry)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(entry.id)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
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
            <div className="space-y-4">
              <div>
                <Label className="text-slate-500">问题</Label>
                <p className="mt-1 text-slate-800 font-medium">{selectedEntry.question}</p>
              </div>
              <div>
                <Label className="text-slate-500">回复话术</Label>
                <p className="mt-1 text-slate-700 whitespace-pre-wrap">{selectedEntry.answer}</p>
              </div>
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
              <div className="flex gap-6 text-sm text-slate-500">
                <span>使用次数: {selectedEntry.usage_count}</span>
                <span>效果评分: {selectedEntry.effectiveness_score}/5</span>
                <span>当前版本: v{selectedEntry.current_version}</span>
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
                        <span className="text-slate-700 line-clamp-3">{v.answer}</span>
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

      {/* Import Word Dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) resetImportForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>从 Word 文档导入话术</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Format guide */}
            <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 space-y-2">
              <p className="font-medium text-slate-700">支持的文档格式：</p>
              <div className="space-y-1.5">
                <p>1. <span className="font-mono text-xs bg-white px-1 rounded">问题：xxx / 答案：xxx</span> 标记格式</p>
                <p>2. 编号列表格式（1. 问题，后跟答案，空行分隔）</p>
                <p>3. 两列表格（第一列问题，第二列答案）</p>
              </div>
              <p className="text-xs text-slate-400">仅支持 .docx 格式</p>
            </div>

            {/* File input */}
            <div>
              <Label>选择文件 *</Label>
              <div className="mt-1">
                <label
                  htmlFor="word-import"
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
                      <p className="text-sm text-slate-500">点击上传 Word 文件</p>
                      <p className="text-xs text-slate-400 mt-1">支持 .docx 格式</p>
                    </div>
                  )}
                  <input
                    id="word-import"
                    ref={fileInputRef}
                    type="file"
                    accept=".docx"
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
                <p className="text-sm text-emerald-700">
                  从文档中解析出 <span className="font-semibold">{importResult.total_parsed}</span> 组问答，
                  成功导入 <span className="font-semibold">{importResult.imported}</span> 条话术
                </p>
                {importResult.entries.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {importResult.entries.map((entry, i) => (
                      <p key={entry.id} className="text-xs text-emerald-600 truncate">
                        {i + 1}. {entry.question}
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
