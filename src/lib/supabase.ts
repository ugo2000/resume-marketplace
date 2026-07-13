import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import type { Bindings } from '../env';
import type { AppVariables } from '../types/app';
import type { Database } from '../types/database';

export type AppContext = Context<{ Bindings: Bindings; Variables: AppVariables }>;

export const getUserClient = (c: AppContext) => {
  const accessToken = c.get('accessToken');
  return createClient<Database>(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_ANON_KEY,
    accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : undefined,
  );
};

export const getServiceClient = (c: AppContext) =>
  createClient<Database>(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
