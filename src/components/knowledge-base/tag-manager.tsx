'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
  type Tag,
} from '@/lib/api';

const PRESET_COLORS = [
  '#0891b2', '#059669', '#7c3aed', '#dc2626',
  '#ea580c', '#ca8a04', '#2563eb', '#db2777',
  '#4f46e5', '#65a30d',
];

export function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#0891b2');

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchTags();
      setTags(res.data ?? []);
    } catch (err) {
      console.error('加载标签失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleSave = async () => {
    if (!formName.trim()) return;
    try {
      if (editingId) {
        await updateTag(editingId, { name: formName, color: formColor });
      } else {
        await createTag({ name: formName, color: formColor });
      }
      setShowDialog(false);
      resetForm();
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此标签吗？')) return;
    try {
      await deleteTag(id);
      loadTags();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const openEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setFormName(tag.name);
    setFormColor(tag.color);
    setShowDialog(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormColor('#0891b2');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">标签管理</h2>
          <p className="text-sm text-slate-500 mt-1">管理话术标签，实现精细化分类</p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowDialog(true);
          }}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          + 新增标签
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 w-20 bg-slate-200 rounded-full animate-pulse" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg">暂无标签</p>
          <p className="text-sm mt-2">点击"新增标签"创建第一个标签</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tags.map((tag) => (
            <Card key={tag.id} className="bg-white hover:shadow-sm transition-shadow">
              <CardContent className="p-3 flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-sm font-medium text-slate-700">{tag.name}</span>
                <div className="flex gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => openEdit(tag)}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-red-500"
                    onClick={() => handleDelete(tag.id)}
                  >
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑标签' : '新增标签'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>标签名称 *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如：紧急、VIP客户、外贸"
                className="mt-1"
              />
            </div>
            <div>
              <Label>标签颜色</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      formColor === color ? 'scale-125 ring-2 ring-offset-2 ring-slate-400' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormColor(color)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Input
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="w-32"
                  placeholder="#0891b2"
                />
                <span
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: formColor }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button
              className="bg-cyan-600 hover:bg-cyan-700"
              onClick={handleSave}
              disabled={!formName.trim()}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
