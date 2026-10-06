import { describe, expect, it } from 'vitest';
import {
  mightContainFlags,
  PREFILTER_MARKERS,
  PROVIDER_MARKERS,
  UNSUPPORTED_MARKERS,
} from '../../src/core/detect/provider-identity.js';

/**
 * The prefilter decides which files are parsed at all, so a marker missing from it
 * is a silent false negative: the scan succeeds and reports fewer flags. Nothing
 * else in the suite would notice, which is why these tests are blunt and
 * exhaustive rather than illustrative.
 */
describe('the parse prefilter', () => {
  it('carries every provider marker', () => {
    for (const marker of Object.values(PROVIDER_MARKERS).flat()) {
      expect(PREFILTER_MARKERS, `${marker} would be skipped before parsing`).toContain(marker);
    }
  });

  it('carries every unsupported-platform marker', () => {
    // These produce no flags, but they produce the disclosure that the inventory
    // is incomplete — which is the claim this product cannot afford to lose.
    for (const marker of Object.values(UNSUPPORTED_MARKERS).flat()) {
      expect(PREFILTER_MARKERS, `${marker} would be skipped before parsing`).toContain(marker);
    }
  });

  it('carries the annotation of the one ungated source provider', () => {
    // spring-conditional needs no import, so nothing in the marker tables covers
    // it. A file using it looks like ordinary Java to every other check here.
    expect(PREFILTER_MARKERS).toContain('ConditionalOnProperty');
  });

  it.each([
    ['a LaunchDarkly import', "import { init } from 'launchdarkly-node-server-sdk';"],
    ['a JVM Unleash import', 'import io.getunleash.Unleash;'],
    ['an OpenFeature import', "import { OpenFeature } from '@openfeature/server-sdk';"],
    ['a Togglz import', 'import org.togglz.core.Feature;'],
    ['a Spring annotation', '@ConditionalOnProperty(name = "features.x")'],
    ['an unsupported platform', 'import com.configcat.ConfigCatClient;'],
  ])('parses a file containing %s', (_label, text) => {
    expect(mightContainFlags(text)).toBe(true);
  });

  it('skips a file that mentions no flag mechanism', () => {
    const text = 'import java.util.List;\nclass A { boolean isEnabled() { return true; } }';
    expect(mightContainFlags(text)).toBe(false);
  });

  it('parses a file naming a Togglz enum found elsewhere in the workspace', () => {
    // The whole reason the prefilter takes an `extra` list. A usage file imports
    // the application's own enum, so no static marker matches it, and skipping it
    // would lose every Togglz usage in the repository.
    const text =
      'import com.example.Features;\nclass A { void m() { Features.CHECKOUT.isActive(); } }';
    expect(mightContainFlags(text), 'without the enum name').toBe(false);
    expect(mightContainFlags(text, ['Features']), 'with it').toBe(true);
  });

  it('parses a file using a configured custom helper', () => {
    // A homegrown helper imports no provider and matches no built-in marker.
    const text = 'class A { void m() { Flags.check("beta"); } }';
    expect(mightContainFlags(text)).toBe(false);
    expect(mightContainFlags(text, ['check'])).toBe(true);
  });

  it('ignores an empty extra marker rather than matching everything', () => {
    // `''` is a substring of every string. One empty entry in a custom-method
    // list would quietly disable the prefilter.
    expect(mightContainFlags('nothing here', [''])).toBe(false);
  });
});
