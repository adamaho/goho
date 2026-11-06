package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import com.adamaho.goho.api.generated.model.BadRequestProblemEncoded
import com.adamaho.goho.api.generated.model.HealthCheck200Response
import com.adamaho.goho.api.generated.model.InternalServerErrorProblemEncoded

interface HealthApi {
    /**
     * GET health
     * Check server liveness
     * Confirms the server is awake; it does not skate over to the database or providers.
     * Responses:
     *  - 200: Success
     *  - 400: Bad Request
     *  - 500: Internal Server Error
     *
     * @return [HealthCheck200Response]
     */
    @GET("health")
    suspend fun healthCheck(): Response<HealthCheck200Response>

}
