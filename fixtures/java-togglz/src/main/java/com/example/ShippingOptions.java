package com.example;

/**
 * An ordinary domain enum implementing an unrelated interface that happens to be
 * called Feature.
 *
 * Nothing here imports Togglz. Matching on the interface's simple name reported
 * EXPRESS and STANDARD as feature flags — `Feature` is a name application code
 * uses constantly, so this must find nothing at all.
 */
interface Feature {}

enum ShippingOptions implements Feature {
    EXPRESS,
    STANDARD
}
