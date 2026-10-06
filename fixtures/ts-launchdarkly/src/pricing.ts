import { init } from 'launchdarkly-node-server-sdk';

const client = init(process.env.LD_SDK_KEY ?? '');

export async function priceFor(userKey: string): Promise<number> {
  // checkout-v2 is evaluated in two files; the inventory must merge them.
  const modern = await client.variation('checkout-v2', { key: userKey }, false);
  return modern ? 9 : 12;
}
