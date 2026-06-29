'use client';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: 'knowledge' | 'qa' | 'categories' | 'tags' | 'statistics') => void;
}

const navItems = [
  { id: 'knowledge' as const, label: '知识库', icon: '📚' },
  { id: 'qa' as const, label: 'AI 问答', icon: '💬' },
  { id: 'categories' as const, label: '分类管理', icon: '📂' },
  { id: 'tags' as const, label: '标签管理', icon: '🏷️' },
  { id: 'statistics' as const, label: '数据统计', icon: '📊' },
];

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#1e293b] text-white flex flex-col">
      <div className="px-6 py-5 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">询盘话术知识库</h1>
        <p className="text-xs text-slate-400 mt-1">AI 驱动 · 专业高效</p>
      </div>
      <nav className="flex-1 py-4">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
              activeTab === item.id
                ? 'bg-cyan-600/20 text-cyan-400 border-r-2 border-cyan-400'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-white/10">
        <p className="text-xs text-slate-500">v1.0.0</p>
      </div>
    </aside>
  );
}
