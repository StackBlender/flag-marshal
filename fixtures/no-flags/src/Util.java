package com.example;

public final class Util {
    private Util() {}

    public static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
