package com.adamaho.goho.api

import java.io.IOException
import kotlinx.serialization.DeserializationStrategy
import retrofit2.Response

/**
 * Whether this is the HTTP 404 that [problem], such as `BookNotFound.serializer()`, describes. A
 * route's `about:blank` 404, another resource's problem, or an empty or malformed body is not,
 * because the generated model requires its own `type`.
 *
 * Reads and closes the error body of any status, so call it once per response, before anything else
 * reads that body.
 */
internal fun Response<*>.isNotFound(problem: DeserializationStrategy<*>): Boolean =
    errorBody()?.use { body ->
        code() == 404 &&
            try {
                apiJson.decodeFromString(problem, body.string())
                true
            } catch (_: IllegalArgumentException) {
                // SerializationException, or a generated enum serializer rejecting a value.
                false
            } catch (_: IOException) {
                false
            }
    } ?: false
