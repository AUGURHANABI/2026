'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { rateQA, type QARecord } from '@/shared/lib/api';
import { useAuth } from '@/shared/lib/auth-context';
import { usePermissions } from '@/shared/lib/permission-context';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  qaId?: string;
  matchedEntryId?: string | null;
  rated?: boolean;
}

export function AIQA() {
  const { session } = useAuth();
  const { hasPermission } = usePermissions();
  const canAsk = hasPermission('qa:ask');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<QARecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    try {
      const token = session?.access_token ?? '';
      const enterpriseId = typeof window !== 'undefined' ? localStorage.getItem('currentEnterpriseId') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['x-session'] = token;
      if (enterpriseId) headers['x-enterprise-id'] = enterpriseId;
      const response = await fetch('/api/qa', {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: userMessage.content }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        let errMsg = '请求失败';
        try { errMsg = JSON.parse(errBody).error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let fullContent = '';
      let qaId = '';
      let matchedEntryId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullContent } : m
                  )
                );
              }
              if (data.done) {
                qaId = data.qa_id ?? '';
                matchedEntryId = data.matched_entry_id ?? null;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: fullContent, qaId, matchedEntryId }
                      : m
                  )
                );
              }
              if (data.error) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: `错误: ${data.error}` }
                      : m
                  )
                );
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `请求失败: ${err instanceof Error ? err.message : '未知错误'}` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleRate = async (messageId: string, rating: number) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message?.qaId) return;

    try {
      await rateQA(message.qaId, rating);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, rated: true } : m
        )
      );
    } catch (err) {
      console.error('评分失败:', err);
    }
  };

  const loadHistory = async () => {
    try {
      const token = session?.access_token ?? '';
      const enterpriseId = typeof window !== 'undefined' ? localStorage.getItem('currentEnterpriseId') : null;
      const headers: Record<string, string> = {};
      if (token) headers['x-session'] = token;
      if (enterpriseId) headers['x-enterprise-id'] = enterpriseId;
      const res = await fetch('/api/statistics?type=qa_history&page_size=10', { headers });
      const data = await res.json();
      setHistory(data.data ?? []);
      setShowHistory(true);
    } catch (err) {
      console.error('加载历史失败:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="min-w-0 flex-1 mr-3">
          <h2 className="text-lg md:text-2xl font-bold text-slate-800">AI 智能问答</h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5 md:mt-1">
            基于知识库的专业询盘回复话术生成
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={loadHistory}>
          历史记录
        </Button>
      </div>

      {/* Chat Area */}
      <div className="bg-white rounded-lg border border-slate-200 min-h-[300px] md:min-h-[500px] max-h-[60vh] md:max-h-[600px] overflow-y-auto flex flex-col">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <p className="text-base md:text-lg mb-2">输入您的询盘问题</p>
              <p className="text-xs md:text-sm">AI 将结合知识库为您生成专业的回复话术</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  {message.role === 'assistant' && !isStreaming && message.qaId && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-xs text-slate-500 mb-2">
                        {message.rated ? '感谢您的反馈' : '这条回复对您有帮助吗？'}
                      </p>
                      {!message.rated && (
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                              key={rating}
                              onClick={() => handleRate(message.id, rating)}
                              className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-cyan-50 hover:border-cyan-400 transition-colors"
                            >
                              {rating}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {message.role === 'assistant' && message.matchedEntryId && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      匹配知识库条目
                    </Badge>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="mt-3 md:mt-4 flex gap-2 md:gap-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={canAsk ? "输入询盘问题，例如：客户询问交期怎么回复？" : "您没有AI问答权限，请联系管理员开通"}
          className="bg-white flex-1 text-sm md:text-base"
          rows={2}
          disabled={isStreaming || !canAsk}
        />
        <Button
          onClick={handleSubmit}
          disabled={isStreaming || !input.trim() || !canAsk}
          className="bg-cyan-600 hover:bg-cyan-700 self-end shrink-0"
          size="sm"
        >
          {isStreaming ? '生成中...' : '发送'}
        </Button>
      </div>

      {/* History Dialog */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">问答历史</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                  关闭
                </Button>
              </div>
              {history.length === 0 ? (
                <p className="text-center text-slate-400 py-8">暂无历史记录</p>
              ) : (
                <div className="space-y-3">
                  {history.map((record) => (
                    <div
                      key={record.id}
                      className="border border-slate-200 rounded-lg p-4"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {record.is_ai_generated ? 'AI 生成' : '知识库匹配'}
                        </Badge>
                        {record.effectiveness_rating && (
                          <Badge className="text-xs bg-amber-500">
                            评分: {record.effectiveness_rating}/5
                          </Badge>
                        )}
                        <span className="text-xs text-slate-400 ml-auto">
                          {new Date(record.created_at).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 font-medium">
                        Q: {record.question}
                      </p>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                        A: {record.answer}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
