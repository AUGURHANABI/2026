'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

/**
 * 让数据视图在以下情况自动重新拉取，保证 PC / 移动端数据同步：
 * - 登录态变化（token 过期后 autoRefreshToken 刷新，session.access_token 改变）
 * - 当前企业切换（currentEnterpriseId 改变，含首次加载到企业 ID 的时序场景）
 * - 窗口重新聚焦 / 页面从后台切回前台（focus + visibilitychange）
 * - 网络恢复（online）/ 'enterprise-changed' 自定义事件
 *
 * 用法：把返回的 syncKey 加入数据加载 useEffect 的依赖数组即可。
 * 采用「拼接字符串 key」而非「计数器 + 单独 bump effect」，
 * 挂载时 key 已是确定值，effect 只跑一次，避免多余的首次重复请求。
 */
export function useDataSync(): { syncKey: string; refresh: () => void } {
  const { session, currentEnterpriseId } = useAuth();
  const [eventCount, setEventCount] = useState(0);
  const bump = useCallback(() => setEventCount((c) => c + 1), []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', bump);
    window.addEventListener('enterprise-changed', bump);
    return () => {
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', bump);
      window.removeEventListener('enterprise-changed', bump);
    };
  }, [bump]);

  const syncKey = `${session?.access_token ?? ''}|${currentEnterpriseId ?? ''}|${eventCount}`;
  return { syncKey, refresh: bump };
}
