'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
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
  PriceRange
} from '@/lib/api';

function PriceRangesEditor({ ranges, onChange, readOnly = false }: { 
  ranges: PriceRange[]; 
  onChange: (ranges: PriceRange[]) => void; 
  readOnly?: boolean 
}) {
  const addRange = () => {
    if (readOnly) return;
    const lastRange = ranges[ranges.length - 1];
    const newMin = lastRange ? (lastRange.max_quantity || lastRange.min_quantity + 1000) + 1 : 1;
    onChange([...ranges, { min_quantity: newMin, max_quantity: null, price: 0, unit: 'CNY' }]);
  };

  const removeRange = (index: number) => {
    if (readOnly) return;
    onChange(ranges.filter((_, i) => i !== index));
  };

  const updateRange = (index: number, field: keyof PriceRange, value: string | number) => {
    if (readOnly) return;
    const newRanges = [...ranges];
    if (field === 'min_quantity' || field === 'max_quantity' || field === 'price') {
      newRanges[index] = { ...newRanges[index], [field]: value === '' ? undefined : Number(value) };
    } else {
      newRanges[index] = { ...newRanges[index], [field]: value };
    }
    onChange(newRanges);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="w-20">最小数量</span>
        <span className="w-20">最大数量</span>
        <span className="w-24">价格</span>
        <span className="w-16">货币</span>
        {!readOnly && <span className="w-10"></span>}
      </div>
      {ranges.map((range, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            type="number"
            className="w-20"
            value={range.min_quantity}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRange(index, 'min_quantity', e.target.value)}
            disabled={readOnly}
          />
          <Input
            type="number"
            className="w-20"
            value={range.max_quantity ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRange(index, 'max_quantity', e.target.value)}
            placeholder="不限"
            disabled={readOnly}
          />
          <Input
            type="number"
            className="w-24"
            value={range.price}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRange(index, 'price', e.target.value)}
            disabled={readOnly}
          />
          <Input
            className="w-16"
            value={range.unit || 'CNY'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRange(index, 'unit', e.target.value)}
            disabled={readOnly}
          />
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={() => removeRange(index)} className="w-10 text-destructive">
              ×
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addRange} className="mt-2">
          + 添加区间
        </Button>
      )}
    </div>
  );
}

function RemarksEditor({ text, images, attachments, onChange, readOnly = false }: {
  text: string;
  images: string[];
  attachments: string[];
  onChange: (data: { text: string; images: string[]; attachments: string[] }) => void;
  readOnly?: boolean;
}) {
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly || !e.target.files) return;
    const files = Array.from(e.target.files);
    const urls: string[] = [];
    for (const file of files) {
      urls.push(`pending:${file.name}`);
    }
    onChange({ text, images: [...images, ...urls], attachments });
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly || !e.target.files) return;
    const files = Array.from(e.target.files);
    const urls: string[] = [];
    for (const file of files) {
      urls.push(`pending:${file.name}`);
    }
    onChange({ text, images, attachments: [...attachments, ...urls] });
  };

  const removeImage = (index: number) => {
    if (readOnly) return;
    onChange({ text, images: images.filter((_, i) => i !== index), attachments });
  };

  const removeAttachment = (index: number) => {
    if (readOnly) return;
    onChange({ text, images, attachments: attachments.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium mb-1 block">备注文字</label>
        <textarea
          className="w-full min-h-[80px] p-2 border rounded-md resize-y text-sm bg-background"
          value={text}
          onChange={(e) => onChange({ text: e.target.value, images, attachments })}
          placeholder="输入备注信息..."
          disabled={readOnly}
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">备注图片</label>
        <div className="flex gap-2 flex-wrap">
          {images.map((url, i) => (
            <div key={i} className="relative w-16 h-16 border rounded overflow-hidden bg-muted">
              <img src={url} className="w-full h-full object-cover" alt="备注图片" />
              {!readOnly && (
                <button onClick={() => removeImage(i)} className="absolute top-0 right-0 w-5 h-5 bg-destructive text-white rounded-bl text-xs">×</button>
              )}
            </div>
          ))}
          {!readOnly && (
            <label className="w-16 h-16 border rounded flex items-center justify-center cursor-pointer hover:bg-muted/50">
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              <span className="text-muted-foreground text-xl">+</span>
            </label>
          )}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">备注附件</label>
        <div className="flex gap-2 flex-wrap">
          {attachments.map((url, i) => (
            <div key={i} className="flex items-center gap-1 px-2 py-1 border rounded bg-muted">
              <span className="text-sm truncate max-w-[120px]">{url.replace('pending:', '')}</span>
              {!readOnly && <button onClick={() => removeAttachment(i)} className="text-destructive text-xs">×</button>}
            </div>
          ))}
          {!readOnly && (
            <label className="px-2 py-1 border rounded cursor-pointer hover:bg-muted/50">
              <input type="file" multiple className="hidden" onChange={handleAttachmentUpload} />
              <span className="text-sm text-muted-foreground">+ 添加附件</span>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

function QuotationDialog({ isOpen, quotation, onClose, onSave, readOnly = false }: {
  isOpen: boolean;
  quotation: ProductQuotation | null;
  onClose: () => void;
  onSave: (data: Partial<ProductQuotation>) => void;
  readOnly?: boolean;
}) {
  const [formData, setFormData] = useState<Partial<ProductQuotation>>({
    product_code: '',
    product_name: '',
    specifications: '',
    packaging_info: '',
    weight: undefined,
    dimensions: '',
    box_specs: '',
    remarks_text: '',
    remarks_images: [],
    remarks_attachments: [],
    price_ranges: [{ min_quantity: 1, max_quantity: null, price: 0, unit: 'CNY' }],
  });

  useEffect(() => {
    if (quotation) {
      setFormData({
        product_code: quotation.product_code || '',
        product_name: quotation.product_name || '',
        specifications: quotation.specifications || '',
        packaging_info: quotation.packaging_info || '',
        weight: quotation.weight,
        dimensions: quotation.dimensions || '',
        box_specs: quotation.box_specs || '',
        remarks_text: quotation.remarks_text || '',
        remarks_images: quotation.remarks_images || [],
        remarks_attachments: quotation.remarks_attachments || [],
        price_ranges: quotation.price_ranges && quotation.price_ranges.length > 0 
          ? quotation.price_ranges 
          : [{ min_quantity: 1, max_quantity: null, price: 0, unit: 'CNY' }],
      });
    } else {
      setFormData({
        product_code: '',
        product_name: '',
        specifications: '',
        packaging_info: '',
        weight: undefined,
        dimensions: '',
        box_specs: '',
        remarks_text: '',
        remarks_images: [],
        remarks_attachments: [],
        price_ranges: [{ min_quantity: 1, max_quantity: null, price: 0, unit: 'CNY' }],
      });
    }
  }, [quotation]);

  if (!isOpen) return null;

  const handleSaveClick = () => {
    if (!formData.product_code || !formData.product_name) {
      alert('请填写产品货号和产品名称');
      return;
    }
    onSave(formData);
  };

  const title = readOnly ? '查看报价详情' : (quotation ? '编辑报价' : '新建报价');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">产品货号 *</label>
              <Input
                value={formData.product_code}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, product_code: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">产品名称 *</label>
              <Input
                value={formData.product_name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, product_name: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">产品规格</label>
              <Input
                value={formData.specifications ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, specifications: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">包装信息</label>
              <Input
                value={formData.packaging_info ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, packaging_info: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">重量(kg)</label>
              <Input
                type="number"
                value={formData.weight ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, weight: e.target.value ? Number(e.target.value) : undefined })}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">尺寸</label>
              <Input
                value={formData.dimensions ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, dimensions: e.target.value })}
                disabled={readOnly}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">箱规信息</label>
            <Input
              value={formData.box_specs ?? ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, box_specs: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">数量区间价格</label>
            <PriceRangesEditor
              ranges={formData.price_ranges || []}
              onChange={(ranges) => setFormData({ ...formData, price_ranges: ranges })}
              readOnly={readOnly}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">备注信息</label>
            <RemarksEditor
              text={formData.remarks_text || ''}
              images={formData.remarks_images || []}
              attachments={formData.remarks_attachments || []}
              onChange={(data) => setFormData({ ...formData, remarks_text: data.text, remarks_images: data.images, remarks_attachments: data.attachments })}
              readOnly={readOnly}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{readOnly ? '关闭' : '取消'}</Button>
          {!readOnly && <Button onClick={handleSaveClick}>保存</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function QuotationList() {
  const { hasPermission } = usePermissions();
  const [quotations, setQuotations] = useState<ProductQuotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<ProductQuotation | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingQuotation, setViewingQuotation] = useState<ProductQuotation | null>(null);
  const [groupByProductName, setGroupByProductName] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canCreate = hasPermission('quotation:create');
  const canEdit = hasPermission('quotation:edit');
  const canDelete = hasPermission('quotation:delete');
  const canImport = hasPermission('quotation:import');
  const canExport = hasPermission('quotation:export');

  // 按产品名称分组
  const groupedProducts = useMemo(() => {
    if (!groupByProductName) return [];
    const groups = new Map<string, ProductQuotation[]>();
    quotations.forEach(q => {
      const name = q.product_name;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(q);
    });
    return Array.from(groups.entries()).map(([productName, items]) => ({ productName, items }));
  }, [quotations, groupByProductName]);

  const toggleGroupExpand = useCallback((productName: string) => {
    setExpandedGroups(prev => 
      prev.includes(productName) ? prev.filter(g => g !== productName) : [...prev, productName]
    );
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchQuotations({ search, page, pageSize });
      setQuotations(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('加载报价失败:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page, pageSize]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = () => { setEditingQuotation(null); setDialogOpen(true); };
  const handleEdit = (q: ProductQuotation) => { setEditingQuotation(q); setDialogOpen(true); };
  const handleView = (q: ProductQuotation) => { setViewingQuotation(q); setViewDialogOpen(true); };
  const handleRowClick = (q: ProductQuotation) => { handleView(q); };

  const handleSave = async (data: Partial<ProductQuotation>) => {
    try {
      if (editingQuotation) {
        // 编辑时确保必填字段存在
        const updateData = {
          product_code: data.product_code || editingQuotation.product_code,
          product_name: data.product_name || editingQuotation.product_name,
          price_ranges: data.price_ranges || editingQuotation.price_ranges,
          specifications: data.specifications,
          packaging_info: data.packaging_info,
          weight: data.weight,
          dimensions: data.dimensions,
          box_specs: data.box_specs,
          remarks_text: data.remarks_text,
          remarks_images: data.remarks_images,
          remarks_attachments: data.remarks_attachments,
        };
        await updateQuotation(editingQuotation.id, updateData);
      } else {
        // 创建时需要所有必填字段
        const createData = {
          product_code: data.product_code!,
          product_name: data.product_name!,
          price_ranges: data.price_ranges!,
          specifications: data.specifications,
          packaging_info: data.packaging_info,
          weight: data.weight,
          dimensions: data.dimensions,
          box_specs: data.box_specs,
          remarks_text: data.remarks_text,
          remarks_images: data.remarks_images,
          remarks_attachments: data.remarks_attachments,
        };
        await createQuotation(createData);
      }
      setDialogOpen(false);
      loadData();
    } catch (err) {
      console.error('保存失败:', err);
      alert('保存失败');
    }
  };

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定删除 ${selectedIds.length} 条报价？`)) return;
    try {
      await batchDeleteQuotations(selectedIds);
      setSelectedIds([]);
      loadData();
    } catch (err) {
      console.error('删除失败:', err);
      alert('删除失败');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importQuotations(file);
      alert(`导入完成: 成功 ${result.successCount} 条, 失败 ${result.errorCount} 条\n${result.errors?.slice(0, 5).join('\n') || ''}`);
      loadData();
    } catch (err) {
      console.error('导入失败:', err);
      alert('导入失败');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    setSelectedIds(quotations.length === selectedIds.length ? [] : quotations.map(q => q.id));
  };

  const formatPriceRanges = (ranges?: PriceRange[]) => {
    if (!ranges || ranges.length === 0) return '-';
    return ranges.map(r => `${r.min_quantity}-${r.max_quantity ?? '∞'}: ¥${r.price}`).join('; ');
  };

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            className="w-48"
            placeholder="搜索产品货号/名称..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />
          <Button
            variant={groupByProductName ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setGroupByProductName(!groupByProductName); setExpandedGroups([]); }}
          >
            {groupByProductName ? '已分组' : '按名称分组'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && <Button onClick={handleCreate}>新建报价</Button>}
          {canImport && (
            <>
              <Button variant="outline" onClick={() => downloadQuotationTemplate()}>下载模板</Button>
              <label className="cursor-pointer">
                <Button variant="outline" asChild><span>导入</span></Button>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
              </label>
            </>
          )}
          {canExport && <Button variant="outline" onClick={exportQuotations}>导出</Button>}
          {canDelete && selectedIds.length > 0 && (
            <Button variant="destructive" onClick={handleDelete}>删除 ({selectedIds.length})</Button>
          )}
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : quotations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">暂无报价数据</div>
      ) : groupByProductName ? (
        // 分组视图
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="p-2 text-left">产品名称</th>
                <th className="p-2 text-left">规格数</th>
                <th className="p-2 text-left">价格示例</th>
                <th className="p-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {groupedProducts.map(group => (
                <Fragment key={group.productName}>
                  <tr className="border-t hover:bg-muted/30 cursor-pointer bg-muted/10" onClick={() => toggleGroupExpand(group.productName)}>
                    <td className="p-2">
                      <Checkbox
                        checked={group.items.every(q => selectedIds.includes(q.id))}
                        onCheckedChange={() => {
                          const allSelected = group.items.every(q => selectedIds.includes(q.id));
                          setSelectedIds(prev => allSelected 
                            ? prev.filter(id => !group.items.some(q => q.id === id))
                            : [...prev, ...group.items.map(q => q.id)]
                          );
                        }}
                      />
                    </td>
                    <td className="p-2 font-medium">{group.productName}</td>
                    <td className="p-2"><Badge variant="secondary">{group.items.length}</Badge></td>
                    <td className="p-2 text-muted-foreground">{formatPriceRanges(group.items[0]?.price_ranges)}</td>
                    <td className="p-2 text-muted-foreground">{expandedGroups.includes(group.productName) ? '▼' : '▶'}</td>
                  </tr>
                  {expandedGroups.includes(group.productName) && group.items.map(q => (
                    <tr key={q.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => handleRowClick(q)}>
                      <td className="p-2">
                        <Checkbox checked={selectedIds.includes(q.id)} onCheckedChange={() => toggleSelect(q.id)} />
                      </td>
                      <td className="p-2 pl-6">{q.product_code}</td>
                      <td className="p-2">{q.specifications || '-'}</td>
                      <td className="p-2">{formatPriceRanges(q.price_ranges)}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleView(q); }}>查看</Button>
                          {canEdit && <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(q); }}>编辑</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // 普通列表
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 w-8"><Checkbox checked={selectedIds.length === quotations.length} onCheckedChange={toggleSelectAll} /></th>
                <th className="p-2 text-left">产品货号</th>
                <th className="p-2 text-left">产品名称</th>
                <th className="p-2 text-left">规格</th>
                <th className="p-2 text-left">包装</th>
                <th className="p-2 text-left">价格区间</th>
                <th className="p-2 w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map(q => (
                <tr key={q.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => handleRowClick(q)}>
                  <td className="p-2">
                    <Checkbox checked={selectedIds.includes(q.id)} onCheckedChange={() => toggleSelect(q.id)} />
                  </td>
                  <td className="p-2">{q.product_code}</td>
                  <td className="p-2 font-medium">{q.product_name}</td>
                  <td className="p-2">{q.specifications || '-'}</td>
                  <td className="p-2">{q.packaging_info || '-'}</td>
                  <td className="p-2 text-xs">{formatPriceRanges(q.price_ranges)}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleView(q); }}>查看</Button>
                      {canEdit && <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(q); }}>编辑</Button>}
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
        <div className="flex justify-center gap-2 items-center text-sm">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="text-muted-foreground">{page} / {totalPages} (共 {total} 条)</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}

      {/* 弹窗 */}
      <QuotationDialog isOpen={dialogOpen} quotation={editingQuotation} onClose={() => setDialogOpen(false)} onSave={handleSave} readOnly={false} />
      <QuotationDialog isOpen={viewDialogOpen} quotation={viewingQuotation} onClose={() => setViewDialogOpen(false)} onSave={() => {}} readOnly={true} />
    </div>
  );
}