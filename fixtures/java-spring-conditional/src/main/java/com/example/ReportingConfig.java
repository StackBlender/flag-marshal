package com.example;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ReportingConfig {

    @Bean
    @ConditionalOnProperty(name = "features.nightly-reports", havingValue = "true")
    public ReportJob nightlyReports() {
        return new ReportJob();
    }

    @Bean
    @ConditionalOnProperty(name = "features.legacy-export")
    public ExportJob legacyExport() {
        return new ExportJob();
    }

    static class ReportJob {}

    static class ExportJob {}
}
