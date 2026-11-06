package com.adamaho.goho.api

import com.adamaho.goho.api.generated.infrastructure.Serializer
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Converter
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.converter.scalars.ScalarsConverterFactory

/**
 * Reads and writes Goho API bodies. Use it instead of the generated
 * `Serializer.kotlinxSerializationJson`, which is lenient and configured through a global hook.
 */
internal val apiJson = Json {
    serializersModule = Serializer.kotlinxSerializationAdapters
    encodeDefaults = true
    ignoreUnknownKeys = true
    // Patch requests leave unchanged fields out; the server rejects null for them.
    explicitNulls = false
    // A bare number can't decode into a money or ID string.
    isLenient = false
}

/** Converters for the generated `ApiClient`, in its default order. */
internal val apiConverterFactories: List<Converter.Factory> =
    listOf(
        ScalarsConverterFactory.create(),
        apiJson.asConverterFactory("application/json".toMediaType()),
    )
