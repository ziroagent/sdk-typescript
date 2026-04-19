import { sessions } from '@/lib/sessions';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const session = sessions.get(id);
  if (!session) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ session });
}
