package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.HealthCheck200Response

interface HealthApi {
    /**
     * GET health
     * Check server liveness
     * Confirms the server is awake; it does not skate over to the database or providers.
     * Responses:
     *  - 200: Success
     *
     * @return [HealthCheck200Response]
     */
    @GET("health")
    suspend fun healthCheck(): Response<HealthCheck200Response>

}
