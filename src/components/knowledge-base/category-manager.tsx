'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePermissions } from '@/lib/permission-context';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type Category,
} from '@/lib/api';

export function CategoryManager() {
  const { hasPermission } = usePermissions();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSortOrder, setFormSortOrder] = useState(0);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCategories();
      setCategories(res.data ?? []);
    } catch (err) {
      console.error('加载分类失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleSave = async () => {
    if (!formName.trim()) return;
    try {
      if (editingId) {
        await updateCategory(editingId, {
          name: formName,
          description: formDescription || undefined,
          sort_order: formSortOrder,
        });
      } else {
        await createCategory({
          name: formName,
          description: formDescription || undefined,
          sort_order: formSortOrder,
        });
      }
      setShowDialog(false);
      resetForm();
      loadCategories();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此分类吗？')) return;
    try {
      await deleteCategory(id);
      loadCategories();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  const openEdit = (cat: Category) => {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormDescription(cat.description ?? '');
    setFormSortOrder(cat.sort_order);
    setShowDialog(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormSortOrder(0);
  };

  return (
    <div className="max-w-4xl mx-auto px-2 md:px-0">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">分类管理</h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1">管理询盘话术的分类，便于快速查找</p>
        </div>
        {hasPermission('category:manage') && (
        <Button
          onClick={() => {
            resetForm();
            setShowDialog(true);
          }}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          + 新增分类
        </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg p-4 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg">暂无分类</p>
          {hasPermission('category:manage') && (
          <p className="text-sm mt-2">点击"新增分类"创建第一个分类</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <Card key={cat.id} className="bg-white hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-slate-800">{cat.name}</span>
                    <span className="text-xs text-slate-400">排序: {cat.sort_order}</span>
                  </div>
                  {cat.description && (
                    <p className="text-sm text-slate-500 mt-1">{cat.description}</p>
                  )}
                </div>
                {hasPermission('category:manage') && (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700"
                    onClick={() => handleDelete(cat.id)}
                  >
                    删除
                  </Button>
                </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑分类' : '新增分类'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>分类名称 *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如：价格谈判、交期确认"
                className="mt-1"
              />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="分类说明"
                rows={3}
                className="mt-1"
              />
            </div>
            <div>
              <Label>排序</Label>
              <Input
                type="number"
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                className="mt-1"
              />
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
