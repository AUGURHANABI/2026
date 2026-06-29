import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { User } from '@supabase/supabase-js';

/**
 * Verify session token from x-session header and return the user.
 * Returns null if not authenticated.
 */
export async function getAuthUser(req: NextRequest): Promise<User | null> {
  const token = req.headers.get('x-session');
  if (!token) return null;

  try {
    const client = getSupabaseClient(token);
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Get the enterprise_id for the current user from the request.
 * First checks query param, then looks up user's enterprise membership.
 */
export async function getEnterpriseId(req: NextRequest, userId: string): Promise<string | null> {
  // Check header first (x-enterprise-id)
  const headerEnterpriseId = req.headers.get('x-enterprise-id');
  if (headerEnterpriseId) return headerEnterpriseId;

  // Check query param next (for GET requests)
  const url = new URL(req.url);
  const enterpriseId = url.searchParams.get('enterprise_id');
  if (enterpriseId) return enterpriseId;

  // Check request body (for POST/PUT)
  try {
    const cloned = req.clone();
    const body = await cloned.json().catch(() => ({}));
    if (body.enterprise_id) return body.enterprise_id;
  } catch {
    // Ignore parse errors
  }

  // Look up user's current enterprise
  const client = getSupabaseClient();
  const { data: membership } = await client
    .from('enterprise_members')
    .select('enterprise_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  return membership?.enterprise_id || null;
}

/**
 * Standard unauthorized response
 */
export function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: '请先登录' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
