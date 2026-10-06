package com.example;

import com.launchdarkly.sdk.LDUser;
import com.launchdarkly.sdk.server.LDClient;

/** Genuine SDK usage: the import is what makes these calls identifiable. */
public class RealFlags {

    private final LDClient client;

    public RealFlags(LDClient client) {
        this.client = client;
    }

    public boolean modernCheckout(String userKey) {
        return client.boolVariation("checkout-v2", new LDUser(userKey), false);
    }
}
