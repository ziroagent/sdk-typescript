---
'@ziro-agent/core': minor
---

Add built-in approver presets for HITL: `autoApprove`, `autoSuspend`,
`autoReject(reason?)`, and `createAutoApprover({ allow, deny, default })`.

Use these in dev / replay / eval environments where a human-in-the-loop
isn't appropriate, instead of writing inline `() => ({ decision:
'approve' })` callbacks. Keeping the intent explicit (no `approver:
true` boolean shortcut) makes "HITL is disabled here" reviewable in
`git grep` and pull requests.

```ts
import { autoApprove, createAutoApprover } from '@ziro-agent/core';

// Disable HITL entirely (dev only).
await agent.run({ prompt: '...', approver: autoApprove });

// Allow read-only tools, deny money movement, suspend everything else.
await agent.run({
  prompt: '...',
  approver: createAutoApprover({
    allow: ['searchDocs', 'getWeather'],
    deny: ['transferFunds'],
    default: 'suspend',
  }),
});
```

`createAutoApprover` defaults to `'suspend'` for unclassified tools so
the operator never silently approves a new tool by forgetting to update
the list (fail-safe, not fail-open).
