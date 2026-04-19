import { streamText, type ChatMessage } from '@ziro-ai/core';
import { resolveModel } from '@/lib/model';
import { sessions } from '@/lib/sessions';

export const runtime = 'nodejs';

interface ChatRequest {
  sessionId?: string;
  messages: ChatMessage[];
  temperature?: number;
}

export async function POST(req: Request): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: '`messages` is required' }, { status: 400 });
  }

  const session = body.sessionId ? sessions.get(body.sessionId) ?? sessions.create() : sessions.create();
  session.messages = body.messages;
  session.trace.push({ type: 'llm-start', at: Date.now(), data: { messages: body.messages.length } });

  let model;
  try {
    model = resolveModel();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    session.trace.push({ type: 'error', at: Date.now(), data: { message } });
    return Response.json({ error: message }, { status: 500 });
  }

  const result = await streamText({
    model,
    messages: body.messages,
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ type: 'session', sessionId: session.id });
      try {
        const reader = result.fullStream.getReader();
        while (true) {
          const { done, value: part } = await reader.read();
          if (done) break;
          if (part.type === 'text-delta') {
            session.trace.push({ type: 'llm-text-delta', at: Date.now(), data: { textDelta: part.textDelta } });
            send({ type: 'text-delta', textDelta: part.textDelta });
          } else if (part.type === 'finish') {
            session.trace.push({ type: 'llm-finish', at: Date.now(), data: part });
            send({ type: 'finish', finishReason: part.finishReason, usage: part.usage });
          } else if (part.type === 'error') {
            const message = part.error instanceof Error ? part.error.message : String(part.error);
            session.trace.push({ type: 'error', at: Date.now(), data: { message } });
            send({ type: 'error', error: message });
          }
        }
        const finalText = await result.text();
        session.messages = [...body.messages, { role: 'assistant', content: finalText }];
        sessions.touch(session.id);
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: 'error', error: message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-ziro-session-id': session.id,
    },
  });
}
