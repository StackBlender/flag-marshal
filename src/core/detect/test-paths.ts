/**
 * Test-file conventions across the JVM and JS ecosystems.
 *
 * A flag referenced only from tests is a distinct kind of debt, and a flag *enum*
 * declared only under test sources is not a flag this repository ships at all.
 */
const TEST_PATH =
  /(^|\/)(__tests__|test|tests|spec|src\/test)\/|\.(test|spec)\.[cm]?[jt]sx?$|Test\.(java|kt)$|Tests\.(java|kt)$/i;

export function isTestPath(path: string): boolean {
  return TEST_PATH.test(path);
}
