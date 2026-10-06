package com.example;

import org.togglz.core.Feature;
import org.togglz.core.annotation.Label;
import org.togglz.core.context.FeatureContext;

/**
 * Togglz names its flags as enum constants rather than string literals.
 *
 * The constants carry constructor arguments containing commas, which is ordinary
 * Togglz and which a comma-splitting parser silently failed on — erasing the whole
 * inventory rather than reporting a partial one.
 */
public enum FeatureFlags implements Feature {
    @Label("New checkout")
    NEW_CHECKOUT("checkout", true),

    @Label("Legacy export")
    LEGACY_EXPORT("export", false),

    RETIRED_BANNER("banner", false);

    private final String area;
    private final boolean defaultActive;

    FeatureFlags(String area, boolean defaultActive) {
        this.area = area;
        this.defaultActive = defaultActive;
    }

    public boolean isActive() {
        return FeatureContext.getFeatureManager().isActive(this);
    }
}
