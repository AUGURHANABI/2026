'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/knowledge-base/sidebar';
import { KnowledgeList } from '@/components/knowledge-base/knowledge-list';
import { AIQA } from '@/components/knowledge-base/ai-qa';
import { CategoryManager } from '@/components/knowledge-base/category-manager';
import { TagManager } from '@/components/knowledge-base/tag-manager';
import { Statistics } from '@/components/knowledge-base/statistics';

type ActiveTab = 'knowledge' | 'qa' | 'categories' | 'tags' | 'statistics';

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('knowledge');

  return (
    <div className="flex min-h-screen">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 ml-64 p-6">
        {activeTab === 'knowledge' && <KnowledgeList />}
        {activeTab === 'qa' && <AIQA />}
        {activeTab === 'categories' && <CategoryManager />}
        {activeTab === 'tags' && <TagManager />}
        {activeTab === 'statistics' && <Statistics />}
      </main>
    </div>
  );
}
