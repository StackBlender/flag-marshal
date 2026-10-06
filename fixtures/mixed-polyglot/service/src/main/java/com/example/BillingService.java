package com.example;

import com.launchdarkly.sdk.LDUser;
import com.launchdarkly.sdk.server.LDClient;

public class BillingService {

    private final LDClient client;

    public BillingService(LDClient client) {
        this.client = client;
    }

    public String plan(String userKey) {
        LDUser user = new LDUser(userKey);
        if (client.boolVariation("unified-billing", user, false)) {
            return "unified";
        }
        return "split";
    }
}
