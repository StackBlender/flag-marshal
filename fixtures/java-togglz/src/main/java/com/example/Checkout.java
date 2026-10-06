package com.example;

import org.togglz.core.Feature;

public class Checkout {
    public String render() {
        if (FeatureFlags.NEW_CHECKOUT.isActive()) {
            return "modern";
        }
        return "legacy";
    }
}
