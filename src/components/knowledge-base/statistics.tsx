'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchStatistics } from '@/lib/api';

interface OverviewData {
  total_entries: number;
  total_categories: number;
  total_tags: number;
  total_qa: number;
  top_entries: Array<{
    id: string;
    question: string;
    usage_count: number;
    effectiveness_score: number;
    categories: { name: string } | null;
  }>;
  recent_qa: Array<{
    id: string;
    question: string;
    answer: string;
    is_ai_generated: boolean;
    effectiveness_rating: number | null;
    created_at: string;
  }>;
  category_distribution: Array<{ name: string; count: number }>;
}

interface EffectivenessData {
  distribution: Record<number, number>;
  average: number;
  total_rated: number;
}

export function Statistics() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [effectiveness, setEffectiveness] = useState<EffectivenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'effectiveness'>('overview');

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const [overviewRes, effRes] = await Promise.all([
          fetchStatistics('overview'),
          fetchStatistics('effectiveness'),
        ]);
        setOverview(overviewRes.data);
        setEffectiveness(effRes.data);
      } catch (err) {
        console.error('加载统计数据失败:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">数据统计</h2>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-lg p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-1/2 mb-3" />
              <div className="h-8 bg-slate-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: '话术总数', value: overview?.total_entries ?? 0, color: 'text-cyan-600' },
    { label: '分类数', value: overview?.total_categories ?? 0, color: 'text-emerald-600' },
    { label: '标签数', value: overview?.total_tags ?? 0, color: 'text-violet-600' },
    { label: '问答次数', value: overview?.total_qa ?? 0, color: 'text-amber-600' },
  ];

  const maxCategoryCount = Math.max(
    ...(overview?.category_distribution?.map((c) => c.count) ?? [1]),
    1
  );

  const maxRatingCount = Math.max(
    ...(Object.values(effectiveness?.distribution ?? {})),
    1
  );

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">数据统计</h2>
        <p className="text-sm text-slate-500 mt-1">知识库运营数据与话术效果分析</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <Card key={card.label} className="bg-white">
            <CardContent className="p-6">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab Switch */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            activeTab === 'overview'
              ? 'bg-cyan-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          总览
        </button>
        <button
          onClick={() => setActiveTab('effectiveness')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            activeTab === 'effectiveness'
              ? 'bg-cyan-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          效果评分
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Category Distribution */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-base">分类分布</CardTitle>
            </CardHeader>
            <CardContent>
              {overview?.category_distribution?.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">暂无数据</p>
              ) : (
                <div className="space-y-3">
                  {overview?.category_distribution?.map((cat) => (
                    <div key={cat.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">{cat.name}</span>
                        <span className="text-slate-400">{cat.count} 条</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-500 rounded-full transition-all"
                          style={{ width: `${(cat.count / maxCategoryCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Entries */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-base">热门话术</CardTitle>
            </CardHeader>
            <CardContent>
              {overview?.top_entries?.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">暂无数据</p>
              ) : (
                <div className="space-y-3">
                  {overview?.top_entries?.map((entry, i) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className={`font-bold min-w-[20px] ${
                        i < 3 ? 'text-amber-500' : 'text-slate-400'
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-700 truncate">{entry.question}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {entry.categories && (
                            <Badge variant="outline" className="text-xs">
                              {entry.categories.name}
                            </Badge>
                          )}
                          <span className="text-xs text-slate-400">
                            使用 {entry.usage_count} 次
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent QA */}
          <Card className="bg-white col-span-2">
            <CardHeader>
              <CardTitle className="text-base">最近问答</CardTitle>
            </CardHeader>
            <CardContent>
              {overview?.recent_qa?.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">暂无数据</p>
              ) : (
                <div className="space-y-3">
                  {overview?.recent_qa?.map((qa) => (
                    <div
                      key={qa.id}
                      className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0"
                    >
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 mt-0.5"
                      >
                        {qa.is_ai_generated ? 'AI' : 'KB'}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 truncate">{qa.question}</p>
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                          {qa.answer}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {qa.effectiveness_rating && (
                          <Badge className="text-xs bg-amber-500">
                            {qa.effectiveness_rating}/5
                          </Badge>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(qa.created_at).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'effectiveness' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Rating Distribution */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-base">评分分布</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[5, 4, 3, 2, 1].map((rating) => {
                  const count = effectiveness?.distribution[rating] ?? 0;
                  return (
                    <div key={rating}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600 flex items-center gap-1">
                          {rating} 分
                          {rating === 5 && <span className="text-xs text-slate-400">(非常有效)</span>}
                          {rating === 4 && <span className="text-xs text-slate-400">(比较有效)</span>}
                          {rating === 3 && <span className="text-xs text-slate-400">(一般)</span>}
                          {rating === 2 && <span className="text-xs text-slate-400">(效果欠佳)</span>}
                          {rating === 1 && <span className="text-xs text-slate-400">(无效)</span>}
                        </span>
                        <span className="text-slate-400">{count} 次</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            rating >= 4
                              ? 'bg-emerald-500'
                              : rating >= 3
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                          }`}
                          style={{
                            width: `${(count / maxRatingCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="bg-white">
            <CardHeader>
              <CardTitle className="text-base">效果总览</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-5xl font-bold text-cyan-600">
                    {effectiveness?.average ?? 0}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">平均效果评分</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <p className="text-2xl font-bold text-slate-700">
                      {effectiveness?.total_rated ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">已评分数</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <p className="text-2xl font-bold text-slate-700">
                      {overview?.total_qa ?? 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">总问答数</p>
                  </div>
                </div>
                <div className="text-sm text-slate-500 bg-amber-50 p-3 rounded-lg">
                  <p className="font-medium text-amber-700">建议</p>
                  <p className="mt-1">
                    {(effectiveness?.average ?? 0) >= 4
                      ? '话术效果整体优秀，建议继续保持当前策略。'
                      : (effectiveness?.average ?? 0) >= 3
                      ? '话术效果良好，可针对低评分话术进行优化。'
                      : '建议重点优化评分较低的话术，并持续补充高质量话术到知识库。'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
