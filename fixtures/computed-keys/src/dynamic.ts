import { init } from 'launchdarkly-node-server-sdk';

const client = init(process.env.LD_SDK_KEY ?? '');

const PREFIX = 'experiment-';

export async function variantFor(name: string, userKey: string): Promise<boolean> {
  // Computed key: not resolvable statically. Must be reported, never guessed.
  return client.variation(PREFIX + name, { key: userKey }, false);
}

export async function fromVariable(userKey: string): Promise<boolean> {
  const key = process.env.ROLLOUT_FLAG ?? 'fallback';
  return client.variation(key, { key: userKey }, false);
}

export async function literal(userKey: string): Promise<boolean> {
  // One genuine literal, so the fixture proves resolvable and unresolvable
  // references can coexist in a single file.
  return client.variation('audit-log', { key: userKey }, false);
}
