package com.example

import io.getunleash.Unleash

class Search(private val unleash: Unleash) {

    fun run(query: String): List<String> {
        if (unleash.isEnabled("search-ranking-v3")) {
            return rankedSearch(query)
        }
        return legacySearch(query)
    }

    fun suggestions(prefix: String): List<String> =
        if (unleash.isEnabled("typeahead")) typeahead(prefix) else emptyList()

    private fun rankedSearch(q: String) = listOf(q)
    private fun legacySearch(q: String) = listOf(q)
    private fun typeahead(p: String) = listOf(p)
}
