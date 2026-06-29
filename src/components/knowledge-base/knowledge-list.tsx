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
import {
  fetchKnowledge,
  fetchCategories,
  fetchTags,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  fetchEntryVersions,
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

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">知识库管理</h2>
          <p className="text-sm text-slate-500 mt-1">管理和检索询盘话术，共 {total} 条</p>
        </div>
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
    </div>
  );
}
