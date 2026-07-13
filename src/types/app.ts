import type { Database } from './database';

export type AppRole = Database['public']['Enums']['user_role'];
export type AppStatus = Database['public']['Enums']['user_status'];

export type SessionUser = {
  id: string;
  email: string;
  role: AppRole;
  status: AppStatus;
};

export type AppVariables = {
  sessionUser: SessionUser | null;
  accessToken: string | null;
};
