import { init, type LDClient } from 'launchdarkly-node-server-sdk';

const client: LDClient = init(process.env.LD_SDK_KEY ?? '');

export async function renderCheckout(userKey: string): Promise<string> {
  if (await client.variation('checkout-v2', { key: userKey }, false)) {
    return 'checkout-v2';
  }
  if (await client.variation('express-shipping', { key: userKey }, false)) {
    return 'express';
  }
  return 'legacy';
}
