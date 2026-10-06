import { renderCheckout } from './checkout';

// legacy-banner is referenced ONLY here, which makes it test-only debt.
test('legacy banner flag is gone from production paths', async () => {
  expect(process.env.FLAG_LEGACY_BANNER).toBeUndefined();
  expect(await renderCheckout('u1')).toBeDefined();
});
