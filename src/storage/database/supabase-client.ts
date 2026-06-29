import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getReportBuffer, createWrappedFetch } from 'coze-coding-dev-sdk';

let envLoaded = false;
let envLoadPromise: Promise<void> | null = null;

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

// Cached client instances (keyed by token presence)
let adminClient: SupabaseClient | null = null;
const tokenClients = new Map<string, SupabaseClient>();

/**
 * Pre-load environment variables asynchronously.
 * Should be called once at server startup to avoid blocking requests.
 */
function loadEnvAsync(): Promise<void> {
  if (envLoaded || (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)) {
    envLoaded = true;
    return Promise.resolve();
  }

  if (envLoadPromise) return envLoadPromise;

  envLoadPromise = (async () => {
    try {
      try {
        require('dotenv').config();
        if (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY) {
          envLoaded = true;
          return;
        }
      } catch {
        // dotenv not available
      }

      // Use async child_process instead of execSync
      const { execFile } = await import('child_process');
      const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;
      const output = await new Promise<string>((resolve, reject) => {
        const proc = execFile('python3', ['-c', pythonCode], {
          encoding: 'utf-8',
          timeout: 10000,
          maxBuffer: 1024 * 1024,
        }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
        proc.stdin?.end();
      });

      const lines = output.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('#')) continue;
        const eqIndex = line.indexOf('=');
        if (eqIndex > 0) {
          const key = line.substring(0, eqIndex);
          let value = line.substring(eqIndex + 1);
          if ((value.startsWith("'") && value.endsWith("'")) ||
              (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }

      envLoaded = true;
    } catch {
      // Silently fail - env vars may not be available during build
    }
  })();

  return envLoadPromise;
}

/**
 * Synchronous env loading (fallback for cold-start first request).
 * Uses execSync but only on the very first call.
 */
function loadEnvSync(): void {
  if (envLoaded || (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)) {
    envLoaded = true;
    return;
  }

  try {
    try {
      require('dotenv').config();
      if (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY) {
        envLoaded = true;
        return;
      }
    } catch {
      // dotenv not available
    }

    const { execSync } = require('child_process') as typeof import('child_process');
    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    envLoaded = true;
  } catch {
    // Silently fail
  }
}

function getSupabaseCredentials(): SupabaseCredentials | null {
  loadEnvSync();

  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

function getSupabaseServiceRoleKey(): string | undefined {
  loadEnvSync();
  return process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Get or create a CACHED Supabase client for server-side use.
 * Returns null if credentials are not available (e.g. during build).
 * 
 * Optimization: Client instances are cached and reused across requests.
 * - Admin client (no token): cached as singleton
 * - Token clients: cached by token string
 */
function getSupabaseClient(token?: string): SupabaseClient | null {
  const creds = getSupabaseCredentials();
  if (!creds) {
    return null;
  }

  // Return cached admin client if no token
  if (!token) {
    if (adminClient) return adminClient;

    const serviceRoleKey = getSupabaseServiceRoleKey();
    const key = serviceRoleKey ?? creds.anonKey;

    const globalOptions: Record<string, unknown> = {};
    try {
      const buffer = getReportBuffer();
      if (buffer) {
        globalOptions.fetch = createWrappedFetch(buffer, 'supabase');
      }
    } catch {
      // Silent
    }

    adminClient = createClient(creds.url, key, {
      global: globalOptions,
      db: { timeout: 15000 },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return adminClient;
  }

  // Return cached token client
  const cached = tokenClients.get(token);
  if (cached) return cached;

  const globalOptions: Record<string, unknown> = {
    headers: { Authorization: `Bearer ${token}` },
  };
  try {
    const buffer = getReportBuffer();
    if (buffer) {
      globalOptions.fetch = createWrappedFetch(buffer, 'supabase');
    }
  } catch {
    // Silent
  }

  const client = createClient(creds.url, creds.anonKey, {
    global: globalOptions,
    db: { timeout: 15000 },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Cache with LRU eviction (max 50 token clients)
  if (tokenClients.size >= 50) {
    const firstKey = tokenClients.keys().next().value;
    if (firstKey) tokenClients.delete(firstKey);
  }
  tokenClients.set(token, client);

  return client;
}

/**
 * Get Supabase client, throwing if credentials are not available.
 * Use this in API routes where credentials must be present at runtime.
 */
function getSupabaseClientOrThrow(token?: string): SupabaseClient {
  const client = getSupabaseClient(token);
  if (!client) {
    throw new Error('Supabase credentials not configured. Please set COZE_SUPABASE_URL and COZE_SUPABASE_ANON_KEY environment variables.');
  }
  return client;
}

/**
 * Get Supabase credentials, throwing if not available.
 * Use this in API routes where credentials must be present at runtime.
 */
function getSupabaseCredentialsOrThrow(): SupabaseCredentials {
  const creds = getSupabaseCredentials();
  if (!creds) {
    throw new Error('Supabase credentials not configured. Please set COZE_SUPABASE_URL and COZE_SUPABASE_ANON_KEY environment variables.');
  }
  return creds;
}

export { loadEnvAsync, getSupabaseCredentials, getSupabaseCredentialsOrThrow, getSupabaseServiceRoleKey, getSupabaseClient, getSupabaseClientOrThrow };
