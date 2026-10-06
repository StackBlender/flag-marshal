package com.example;

/**
 * Ordinary application code that shares method names with flag SDKs.
 *
 * Nothing in this file imports a flag provider, so nothing in it is a feature
 * flag. Every method here was reported as one before provider identity was
 * required.
 */
public class OrdinaryCode {

    public void audit(boolean isEnabled) {
        // A Lombok builder setter, not Unleash.
        AppSettingsAuditEvent.builder().isEnabled(isEnabled).build();
    }

    public String intakeField(Intake intake) {
        // An application helper, not OpenFeature.
        return getStringValue(intake, "most_recent_hospitalization_or_ed_visit");
    }

    public boolean anyVariation(Plan plan) {
        // A domain method that happens to be called variation.
        return plan.variation("standard");
    }

    private String getStringValue(Intake intake, String field) {
        return intake.get(field);
    }

    static class AppSettingsAuditEvent {
        static Builder builder() {
            return new Builder();
        }

        static class Builder {
            Builder isEnabled(boolean value) {
                return this;
            }

            AppSettingsAuditEvent build() {
                return new AppSettingsAuditEvent();
            }
        }
    }

    static class Intake {
        String get(String field) {
            return field;
        }
    }

    static class Plan {
        boolean variation(String name) {
            return true;
        }
    }
}
