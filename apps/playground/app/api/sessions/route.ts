import { sessions } from '@/lib/sessions';

export const runtime = 'nodejs';

export function GET(): Response {
  return Response.json({ sessions: sessions.list() });
}
