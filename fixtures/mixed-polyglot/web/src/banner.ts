import { init } from 'launchdarkly-node-server-sdk';

const client = init(process.env.LD_SDK_KEY ?? '');

export async function banner(userKey: string): Promise<boolean> {
  // Same key is evaluated from Java in ../service. One record, two languages.
  return client.variation('unified-billing', { key: userKey }, false);
}
