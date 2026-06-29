# 项目：询盘话术知识库

## 项目概览
AI驱动的询盘话术问答知识库系统，支持知识库管理、AI智能问答、分类标签、版本管理和数据统计。

## 版本技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **AI**: coze-coding-dev-sdk (LLM)

## 目录结构
```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── categories/         # 分类 CRUD API
│   │   │   ├── tags/               # 标签 CRUD API
│   │   │   ├── knowledge/          # 知识库条目 CRUD + 版本历史 API
│   │   │   ├── qa/                 # AI 问答 API (SSE 流式输出)
│   │   │   └── statistics/         # 数据统计 API
│   │   ├── layout.tsx              # 根布局
│   │   ├── page.tsx                # 主页面 (Tab 导航)
│   │   └── globals.css             # 全局样式
│   ├── components/
│   │   ├── knowledge-base/
│   │   │   ├── sidebar.tsx         # 侧边栏导航
│   │   │   ├── knowledge-list.tsx  # 知识库管理
│   │   │   ├── ai-qa.tsx           # AI 问答 (流式)
│   │   │   ├── category-manager.tsx # 分类管理
│   │   │   ├── tag-manager.tsx     # 标签管理
│   │   │   └── statistics.tsx      # 数据统计
│   │   └── ui/                     # shadcn/ui 组件
│   ├── lib/
│   │   ├── api.ts                  # API 调用封装 + 类型定义
│   │   └── utils.ts                # 工具函数
│   └── storage/database/
│       └── supabase-client.ts       # Supabase 客户端
├── DESIGN.md                       # 设计规范
└── AGENTS.md                       # 本文件
```

## 构建和测试命令
- 开发: `pnpm run dev`
- 构建: `pnpm run build`
- 类型检查: `pnpm run ts-check`
- Lint: `pnpm run lint`
- 生产启动: `pnpm run start`

## 数据库表
- `categories` - 话术分类
- `tags` - 标签
- `knowledge_entries` - 知识库条目
- `knowledge_entry_tags` - 条目-标签多对多
- `entry_versions` - 条目版本历史
- `qa_history` - 问答历史记录

## API 接口清单
1. `GET/POST /api/categories` - 分类列表/创建
2. `GET/PUT/DELETE /api/categories/[id]` - 分类详情/更新/删除
3. `GET/POST /api/tags` - 标签列表/创建
4. `PUT/DELETE /api/tags/[id]` - 标签更新/删除
5. `GET/POST /api/knowledge` - 知识库列表(搜索+分页)/创建
6. `GET/PUT/DELETE /api/knowledge/[id]` - 条目详情/更新/删除
7. `GET /api/knowledge/[id]/versions` - 版本历史
8. `POST /api/qa` - AI 问答 (SSE 流式)
9. `PUT /api/qa/[id]` - 问答评分
10. `GET /api/statistics?type=overview|qa_history|effectiveness` - 统计数据
11. `GET /api/knowledge/template` - 下载 Excel 导入模板
12. `POST /api/knowledge/import` - 导入话术（支持 .xlsx 和 .docx）

## 编码规范
- 仅使用 pnpm 管理依赖
- TypeScript strict 模式
- 字段名 snake_case (数据库), 组件 camelCase
- Supabase 操作必须检查 `{ data, error }` 并 throw
- delete/update 必须带 filter
- AI 问答默认使用 SSE 流式输出
- LLM 仅在后端使用 (coze-coding-dev-sdk)
