'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePermissions } from '@/lib/permission-context';
import {
  fetchQuotations,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  batchDeleteQuotations,
  downloadQuotationTemplate,
  importQuotations,
  exportQuotations,
  ProductQuotation,
  PriceRange,
} from '@/lib/api';

// 价格区间编辑器组件
function PriceRangesEditor({
  ranges,
  onChange,
}: {
  ranges: PriceRange[];
  onChange: (ranges: PriceRange[]) => void;
}) {
  const addRange = () => {
    const lastMax = ranges.length > 0 ? ranges[ranges.length - 1].max_quantity || 1000 : 0;
    onChange([
      ...ranges,
      {
        min_quantity: lastMax + 1,
        max_quantity: null,
        price: 0,
        unit: 'CNY',
      },
    ]);
  };

  const removeRange = (index: number) => {
    onChange(ranges.filter((_, i) => i !== index));
  };

  const updateRange = (index: number, field: keyof PriceRange, value: number | string | null) => {
    const updated = [...ranges];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">数量区间价格</label>
        <button
          type="button"
          onClick={addRange}
          className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
        >
          + 添加区间
        </button>
      </div>

      {ranges.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">暂无价格区间，点击上方按钮添加</p>
      ) : (
        <div className="space-y-2">
          {ranges.map((range, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="number"
                  value={range.min_quantity}
                  onChange={(e) => updateRange(index, 'min_quantity', parseInt(e.target.value) || 1)}
                  className="w-16 px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="最小"
                  min="1"
                />
                <span className="text-muted-foreground">-</span>
                <input
                  type="number"
                  value={range.max_quantity || ''}
                  onChange={(e) => updateRange(index, 'max_quantity', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-16 px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="最大"
                  min={range.min_quantity + 1}
                />
                <span className="text-muted-foreground text-xs">件</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={range.price}
                  onChange={(e) => updateRange(index, 'price', parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="价格"
                  min="0"
                  step="0.01"
                />
                <select
                  value={range.unit}
                  onChange={(e) => updateRange(index, 'unit', e.target.value)}
                  className="px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="CNY">CNY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => removeRange(index)}
                className="text-destructive hover:text-destructive/80 text-xs"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 备注编辑器组件（文字+图片+附件）
function RemarksEditor({
  text,
  images,
  attachments,
  onTextChange,
  onImagesChange,
  onAttachmentsChange,
}: {
  text: string;
  images: string[];
  attachments: string[];
  onTextChange: (text: string) => void;
  onImagesChange: (images: string[]) => void;
  onAttachmentsChange: (attachments: string[]) => void;
}) {
  const [imageUrls, setImageUrls] = useState<string[]>(images);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>(attachments);

  // 添加图片 URL
  const addImageUrl = () => {
    const url = prompt('请输入图片URL');
    if (url && url.trim()) {
      const newUrls = [...imageUrls, url.trim()];
      setImageUrls(newUrls);
      onImagesChange(newUrls);
    }
  };

  // 删除图片
  const removeImage = (index: number) => {
    const newUrls = imageUrls.filter((_, i) => i !== index);
    setImageUrls(newUrls);
    onImagesChange(newUrls);
  };

  // 添加附件 URL
  const addAttachmentUrl = () => {
    const url = prompt('请输入附件URL（如PDF、Excel等）');
    if (url && url.trim()) {
      const newUrls = [...attachmentUrls, url.trim()];
      setAttachmentUrls(newUrls);
      onAttachmentsChange(newUrls);
    }
  };

  // 删除附件
  const removeAttachment = (index: number) => {
    const newUrls = attachmentUrls.filter((_, i) => i !== index);
    setAttachmentUrls(newUrls);
    onAttachmentsChange(newUrls);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-2 block">备注文字</label>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
          placeholder="输入备注内容..."
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">备注图片</label>
          <button
            type="button"
            onClick={addImageUrl}
            className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
          >
            + 添加图片
          </button>
        </div>
        {imageUrls.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {imageUrls.map((url, index) => (
              <div key={index} className="relative group">
                <img
                  src={url}
                  alt={`图片${index + 1}`}
                  className="w-full h-20 object-cover rounded border border-border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/placeholder.png';
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-1 right-1 bg-destructive text-white rounded-full w-4 h-4 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">暂无图片</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">备注附件</label>
          <button
            type="button"
            onClick={addAttachmentUrl}
            className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors"
          >
            + 添加附件
          </button>
        </div>
        {attachmentUrls.length > 0 ? (
          <div className="space-y-1">
            {attachmentUrls.map((url, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded group">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate flex-1">
                  {url.split('/').pop() || url}
                </a>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="text-destructive hover:text-destructive/80 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">暂无附件</p>
        )}
      </div>
    </div>
  );
}

// 报价详情对话框
function QuotationDialog({
  quotation,
  isOpen,
  onClose,
  onSave,
}: {
  quotation: ProductQuotation | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    product_code: string;
    product_name: string;
    specifications?: string;
    packaging_info?: string;
    weight?: number;
    dimensions?: string;
    box_specs?: string;
    remarks_text?: string;
    remarks_images?: string[];
    remarks_attachments?: string[];
    price_ranges: PriceRange[];
  }) => void;
}) {
  const [formData, setFormData] = useState({
    product_code: '',
    product_name: '',
    specifications: '',
    packaging_info: '',
    weight: '',
    dimensions: '',
    box_specs: '',
    remarks_text: '',
    remarks_images: [] as string[],
    remarks_attachments: [] as string[],
    price_ranges: [] as PriceRange[],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (quotation) {
      setFormData({
        product_code: quotation.product_code,
        product_name: quotation.product_name,
        specifications: quotation.specifications || '',
        packaging_info: quotation.packaging_info || '',
        weight: quotation.weight?.toString() || '',
        dimensions: quotation.dimensions || '',
        box_specs: quotation.box_specs || '',
        remarks_text: quotation.remarks_text || '',
        remarks_images: quotation.remarks_images || [],
        remarks_attachments: quotation.remarks_attachments || [],
        price_ranges: quotation.price_ranges || [],
      });
    } else {
      setFormData({
        product_code: '',
        product_name: '',
        specifications: '',
        packaging_info: '',
        weight: '',
        dimensions: '',
        box_specs: '',
        remarks_text: '',
        remarks_images: [],
        remarks_attachments: [],
        price_ranges: [{ min_quantity: 1, max_quantity: null, price: 0, unit: 'CNY' }],
      });
    }
  }, [quotation, isOpen]);

  const handleSave = async () => {
    if (!formData.product_code || !formData.product_name) {
      alert('产品货号和产品名称为必填项');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        product_code: formData.product_code,
        product_name: formData.product_name,
        specifications: formData.specifications || undefined,
        packaging_info: formData.packaging_info || undefined,
        weight: formData.weight ? parseFloat(formData.weight) : undefined,
        dimensions: formData.dimensions || undefined,
        box_specs: formData.box_specs || undefined,
        remarks_text: formData.remarks_text || undefined,
        remarks_images: formData.remarks_images,
        remarks_attachments: formData.remarks_attachments,
        price_ranges: formData.price_ranges,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {quotation ? '编辑报价' : '新增报价'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* 基本信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                产品货号 <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={formData.product_code}
                onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="SKU001"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                产品名称 <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="硅胶密封圈"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">产品规格</label>
              <input
                type="text"
                value={formData.specifications}
                onChange={(e) => setFormData({ ...formData, specifications: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="直径50mm，厚度3mm"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">包装信息</label>
              <input
                type="text"
                value={formData.packaging_info}
                onChange={(e) => setFormData({ ...formData, packaging_info: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="PE袋包装"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">重量(kg)</label>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="0.05"
                min="0"
                step="0.001"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">尺寸</label>
              <input
                type="text"
                value={formData.dimensions}
                onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="50x50x3mm"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">箱规</label>
              <input
                type="text"
                value={formData.box_specs}
                onChange={(e) => setFormData({ ...formData, box_specs: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="100个/箱"
              />
            </div>
          </div>

          {/* 价格区间 */}
          <PriceRangesEditor
            ranges={formData.price_ranges}
            onChange={(ranges) => setFormData({ ...formData, price_ranges: ranges })}
          />

          {/* 备注 */}
          <RemarksEditor
            text={formData.remarks_text}
            images={formData.remarks_images}
            attachments={formData.remarks_attachments}
            onTextChange={(text) => setFormData({ ...formData, remarks_text: text })}
            onImagesChange={(images) => setFormData({ ...formData, remarks_images: images })}
            onAttachmentsChange={(attachments) => setFormData({ ...formData, remarks_attachments: attachments })}
          />
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 主组件
export default function QuotationList() {
  const { hasPermission } = usePermissions();
  const [quotations, setQuotations] = useState<ProductQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<ProductQuotation | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission('quotation:create');
  const canEdit = hasPermission('quotation:edit');
  const canDelete = hasPermission('quotation:delete');
  const canImport = hasPermission('quotation:import');
  const canExport = hasPermission('quotation:export');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchQuotations({ search, page, pageSize });
      setQuotations(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('Failed to load quotations:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = () => {
    setEditingQuotation(null);
    setDialogOpen(true);
  };

  const handleEdit = (quotation: ProductQuotation) => {
    setEditingQuotation(quotation);
    setDialogOpen(true);
  };

  const handleSave = async (data: {
    product_code: string;
    product_name: string;
    specifications?: string;
    packaging_info?: string;
    weight?: number;
    dimensions?: string;
    box_specs?: string;
    remarks_text?: string;
    remarks_images?: string[];
    remarks_attachments?: string[];
    price_ranges: PriceRange[];
  }) => {
    if (editingQuotation) {
      await updateQuotation(editingQuotation.id, data);
    } else {
      await createQuotation(data);
    }
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此报价吗？')) return;
    await deleteQuotation(id);
    loadData();
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 条报价吗？`)) return;
    await batchDeleteQuotations(selectedIds);
    setSelectedIds([]);
    loadData();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importQuotations(file);
      alert(`导入完成：成功 ${result.importedCount} 条，失败 ${result.errorCount} 条`);
      if (result.errorCount > 0 && result.errors.length > 0) {
        console.warn('Import errors:', result.errors);
      }
      loadData();
    } catch (err) {
      alert(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExport = async () => {
    try {
      await exportQuotations();
    } catch (err) {
      alert(`导出失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadQuotationTemplate();
    } catch (err) {
      alert(`下载失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === quotations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(quotations.map(q => q.id));
    }
  };

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="搜索货号或名称..."
          className="flex-1 min-w-[200px] px-3 py-2 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
        />

        {canCreate && (
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + 新增报价
          </button>
        )}

        {canImport && (
          <>
            <button
              onClick={handleDownloadTemplate}
              className="px-3 py-2 border border-border rounded-md text-sm hover:bg-muted/50 transition-colors"
            >
              下载模板
            </button>
            <label className="px-3 py-2 border border-border rounded-md text-sm hover:bg-muted/50 transition-colors cursor-pointer">
              {importing ? '导入中...' : '导入'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleImport}
                className="hidden"
                disabled={importing}
              />
            </label>
          </>
        )}

        {canExport && (
          <button
            onClick={handleExport}
            className="px-3 py-2 border border-border rounded-md text-sm hover:bg-muted/50 transition-colors"
          >
            导出
          </button>
        )}

        {canDelete && selectedIds.length > 0 && (
          <button
            onClick={handleBatchDelete}
            className="px-3 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors"
          >
            删除选中 ({selectedIds.length})
          </button>
        )}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">加载中...</div>
      ) : quotations.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          {search ? '未找到匹配的报价' : '暂无报价数据'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === quotations.length && quotations.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border"
                  />
                </th>
                <th className="px-3 py-3 text-left font-medium">货号</th>
                <th className="px-3 py-3 text-left font-medium">名称</th>
                <th className="px-3 py-3 text-left font-medium">规格</th>
                <th className="px-3 py-3 text-left font-medium">价格区间</th>
                <th className="px-3 py-3 text-left font-medium">箱规</th>
                <th className="px-3 py-3 text-left font-medium">更新时间</th>
                <th className="px-3 py-3 text-left font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotations.map(q => (
                <tr key={q.id} className="hover:bg-muted/30">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(q.id)}
                      onChange={() => toggleSelect(q.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                  </td>
                  <td className="px-3 py-3 font-medium">{q.product_code}</td>
                  <td className="px-3 py-3">{q.product_name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{q.specifications || '-'}</td>
                  <td className="px-3 py-3">
                    {q.price_ranges.length > 0 ? (
                      <div className="space-y-0.5">
                        {q.price_ranges.slice(0, 2).map((pr, i) => (
                          <div key={i} className="text-xs">
                            {pr.min_quantity}-{pr.max_quantity || '∞'}: {pr.price} {pr.unit}
                          </div>
                        ))}
                        {q.price_ranges.length > 2 && (
                          <div className="text-xs text-muted-foreground">+{q.price_ranges.length - 2} 更多区间</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{q.box_specs || '-'}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {new Date(q.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(q)}
                          className="text-primary hover:text-primary/80 text-xs"
                        >
                          编辑
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="text-destructive hover:text-destructive/80 text-xs"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">共 {total} 条</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-border rounded hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              上一页
            </button>
            <span className="text-muted-foreground">第 {page}/{totalPages} 页</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 border border-border rounded hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* 编辑对话框 */}
      <QuotationDialog
        quotation={editingQuotation}
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}