import { ApiClient } from './api';

test('mutation sends credentials, csrf, and idempotency headers', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const client = new ApiClient(fetcher);
  client.setCsrf('csrf-token');
  await client.mutate({ id: 'mutation-1234', method: 'POST', path: '/tasks', body: { title: 'Read' }, createdAt: '' });
  expect(fetcher).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({
    credentials: 'same-origin',
    headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token', 'X-Mutation-ID': 'mutation-1234' }),
  }));
});

test('api errors keep status and safe server message', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Sign in to continue.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
  await expect(new ApiClient(fetcher).getSession()).rejects.toEqual(expect.objectContaining({ status: 401, message: 'Sign in to continue.' }));
});

test('native fetch is called without rebinding its receiver', async () => {
  let receiver: unknown = 'not called';
  const fetcher = function (this: unknown) { receiver = this; return Promise.resolve(new Response('{"setupRequired":true}', { headers: { 'Content-Type': 'application/json' } })); } as typeof fetch;
  await new ApiClient(fetcher).getSetupStatus();
  expect(receiver).toBeUndefined();
});
