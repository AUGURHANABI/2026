import type { Metadata } from 'next';
import './globals.css';
import { SupabaseConfigProvider } from '@/shared/lib/supabase-config-inject';
import { AuthProvider } from '@/shared/lib/auth-context';
import { PermissionProvider } from '@/shared/lib/permission-context';

export const metadata: Metadata = {
  title: '询盘话术知识库',
  description: 'AI驱动的询盘话术问答知识库系统，助您快速生成专业的询盘回复',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen bg-[#f8fafc]">
        <SupabaseConfigProvider>
          <AuthProvider>
            <PermissionProvider>
              {children}
            </PermissionProvider>
          </AuthProvider>
        </SupabaseConfigProvider>
      </body>
    </html>
  );
}
