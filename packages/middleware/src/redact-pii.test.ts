import { wrapModel } from '@ziro-agent/core';
import { describe, expect, it, vi } from 'vitest';
import { heuristicPiiAdapter, type PiiAdapter, redactPII } from './redact-pii.js';
import { baseOptions, makeFakeModel, userMessage } from './test-helpers.js';

describe('heuristicPiiAdapter', () => {
  const adapter = heuristicPiiAdapter();

  it('redacts emails', async () => {
    const r = await adapter.redact({
      text: 'contact me: jane.doe@example.com',
      entities: ['EMAIL'],
    });
    expect(r.redacted).toBe('contact me: [EMAIL_1]');
    expect(Object.values(r.replacements)).toContain('jane.doe@example.com');
  });

  it('redacts SSN', async () => {
    const r = await adapter.redact({ text: 'ssn 123-45-6789', entities: ['SSN'] });
    expect(r.redacted).toContain('[SSN_1]');
    expect(r.replacements['[SSN_1]']).toBe('123-45-6789');
  });

  it('redacts credit cards', async () => {
    const r = await adapter.redact({
      text: 'card 4111 1111 1111 1111',
      entities: ['CREDIT_CARD'],
    });
    expect(r.redacted).toContain('[CREDIT_CARD_1]');
  });

  it('numbers multiple matches sequentially', async () => {
    const r = await adapter.redact({
      text: 'a@b.com and c@d.io',
      entities: ['EMAIL'],
    });
    expect(r.redacted).toBe('[EMAIL_1] and [EMAIL_2]');
    expect(Object.keys(r.replacements)).toHaveLength(2);
  });

  it('leaves text untouched when entity is not requested', async () => {
    const r = await adapter.redact({ text: 'a@b.com', entities: ['SSN'] });
    expect(r.redacted).toBe('a@b.com');
    expect(r.replacements).toEqual({});
  });
});

describe('redactPII middleware', () => {
  it('rewrites user messages BEFORE the model sees them', async () => {
    const model = makeFakeModel();
    const wrapped = wrapModel(model, redactPII({ entities: ['EMAIL'] }));

    await wrapped.generate({
      messages: [userMessage('email me at sam@acme.io')],
    });

    const sentMessages = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.messages;
    const part = sentMessages?.[0]?.content?.[0];
    expect(part).toEqual({ type: 'text', text: 'email me at [EMAIL_1]' });
  });

  it('passes through unchanged when no PII matches', async () => {
    const model = makeFakeModel();
    const wrapped = wrapModel(model, redactPII({ entities: ['EMAIL', 'PHONE_NUMBER'] }));
    await wrapped.generate(baseOptions('hello world'));
    const sentMessages = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.messages;
    expect(sentMessages?.[0]?.content?.[0]).toEqual({ type: 'text', text: 'hello world' });
  });

  it('skips tool messages by design', async () => {
    const model = makeFakeModel();
    const wrapped = wrapModel(model, redactPII({ entities: ['EMAIL'] }));
    await wrapped.generate({
      messages: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 't1',
              toolName: 'lookup',
              result: 'sam@acme.io',
            },
          ],
        },
      ],
    });
    const sent = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.messages?.[0];
    // Tool messages are NOT redacted (the result still contains the email).
    expect(JSON.stringify(sent)).toContain('sam@acme.io');
  });

  it('invokes onRedacted with the replacement map', async () => {
    const onRedacted = vi.fn();
    const model = makeFakeModel();
    const wrapped = wrapModel(model, redactPII({ entities: ['EMAIL'], onRedacted }));
    await wrapped.generate({ messages: [userMessage('a@b.io')] });
    expect(onRedacted).toHaveBeenCalledTimes(1);
    expect(onRedacted.mock.calls[0]?.[0]?.replacements).toEqual({ '[EMAIL_1]': 'a@b.io' });
  });

  it('does NOT call onRedacted when nothing was redacted', async () => {
    const onRedacted = vi.fn();
    const model = makeFakeModel();
    const wrapped = wrapModel(model, redactPII({ entities: ['EMAIL'], onRedacted }));
    await wrapped.generate(baseOptions('plain text'));
    expect(onRedacted).not.toHaveBeenCalled();
  });

  it('uses a custom adapter when supplied', async () => {
    const customAdapter: PiiAdapter = {
      redact: ({ text }) => ({
        redacted: text.replaceAll('secret', '[REDACTED]'),
        replacements: { '[REDACTED]': 'secret' },
      }),
    };
    const model = makeFakeModel();
    const wrapped = wrapModel(model, redactPII({ adapter: customAdapter, entities: ['EMAIL'] }));
    await wrapped.generate({ messages: [userMessage('this is a secret token')] });
    const sent = (model.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.messages?.[0]
      ?.content?.[0];
    expect(sent).toEqual({ type: 'text', text: 'this is a [REDACTED] token' });
  });
});
