package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.EffectHttpApiErrorInternalServerErrorEncoded
import com.adamaho.goho.api.generated.model.EffectHttpApiErrorNotFoundEncoded
import com.adamaho.goho.api.generated.model.ReceiptUploadsCreate202Response
import com.adamaho.goho.api.generated.model.ReceiptUploadsGet200Response

import okhttp3.MultipartBody

interface ReceiptUploadsApi {
    /**
     * POST receipt-uploads
     * Upload a receipt image
     * Stores one receipt image and returns its queued status before processing starts.
     * Responses:
     *  - 202: Success
     *  - 400: The upload is missing a supported receipt image.
     *  - 500: The server could not store or queue the receipt image.
     *
     * @param file 
     * @return [ReceiptUploadsCreate202Response]
     */
    @Multipart
    @POST("receipt-uploads")
    suspend fun receiptUploadsCreate(@Part file: MultipartBody.Part): Response<ReceiptUploadsCreate202Response>

    /**
     * GET receipt-uploads/{uploadId}
     * Get receipt upload status
     * Returns the latest queue or processing status and the receipt ID after a clean finish.
     * Responses:
     *  - 200: Success
     *  - 404: No receipt upload is wearing that number, bud.
     *  - 500: The server could not retrieve this receipt upload.
     *
     * @param uploadId 
     * @return [ReceiptUploadsGet200Response]
     */
    @GET("receipt-uploads/{uploadId}")
    suspend fun receiptUploadsGet(@Path("uploadId") uploadId: java.util.UUID): Response<ReceiptUploadsGet200Response>

}
