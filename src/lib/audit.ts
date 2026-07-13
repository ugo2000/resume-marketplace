import type { AppContext } from './supabase';
import { getServiceClient } from './supabase';
import type { Json } from '../types/database';

export const auditEntry = (
  actorUserId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, Json> = {},
) => ({
  actor_user_id: actorUserId,
  action,
  target_type: targetType,
  target_id: targetId,
  metadata,
});

export const recordAudit = async (
  c: AppContext,
  actorUserId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, Json> = {},
) => {
  const { error } = await getServiceClient(c)
    .from('audit_logs')
    .insert(auditEntry(actorUserId, action, targetType, targetId, metadata));
  if (error) throw error;
};
