/**
 * Ordered deletion hooks for a single user / tenant (RFC 0016).
 * Callers wire concrete storage adapters; this module only sequences work.
 */
export interface DeleteUserDataRequest {
  userId: string;
  threadIds: readonly string[];
}

export interface DeleteUserDataHooks {
  /** Stop live sessions / revoke tokens before touching durable stores. */
  revokeSessions?: () => Promise<void>;
  /** Agent checkpoints / HITL snapshots (see `Checkpointer` in `@ziro-agent/agent`). */
  deleteAgentCheckpoints?: (threadIds: readonly string[]) => Promise<void>;
  /** Conversation memory files, exports, or other thread-scoped artifacts. */
  deleteConversationArtifacts?: (threadIds: readonly string[]) => Promise<void>;
  /** Vector / retrieval indices keyed by tenant or user. */
  deleteVectorTenantData?: (userId: string) => Promise<void>;
  /** Append-only audit or access logs (e.g. `@ziro-agent/audit`). */
  deleteAuditRecords?: (userId: string) => Promise<void>;
}

/**
 * Runs hooks in a conservative order: sessions → checkpoints → conversation
 * files → vectors → audit. Omitted hooks are skipped.
 */
export async function deleteUserDataInOrder(
  req: DeleteUserDataRequest,
  hooks: DeleteUserDataHooks,
): Promise<void> {
  if (hooks.revokeSessions) await hooks.revokeSessions();
  if (hooks.deleteAgentCheckpoints) await hooks.deleteAgentCheckpoints(req.threadIds);
  if (hooks.deleteConversationArtifacts) await hooks.deleteConversationArtifacts(req.threadIds);
  if (hooks.deleteVectorTenantData) await hooks.deleteVectorTenantData(req.userId);
  if (hooks.deleteAuditRecords) await hooks.deleteAuditRecords(req.userId);
}
