package com.example

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty

// Kotlin names its properties in an array literal, even for a single key.
@ConditionalOnProperty(
    name = ["acmeco.allow-override-user-expiration"],
    havingValue = "true",
)
class Overrides

@ConditionalOnProperty(
    name = ["scheduledJobs.aiAppointment.enabled"],
    havingValue = "true",
)
class AiAppointment
