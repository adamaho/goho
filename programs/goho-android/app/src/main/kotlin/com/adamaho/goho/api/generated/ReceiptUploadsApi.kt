package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.EffectHttpApiErrorConflictEncoded
import com.adamaho.goho.api.generated.model.EffectHttpApiErrorInternalServerErrorEncoded
import com.adamaho.goho.api.generated.model.EffectHttpApiErrorNotFoundEncoded
import com.adamaho.goho.api.generated.model.ReceiptUploadsCreate202Response
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200Response

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
     * DELETE receipt-uploads/{uploadId}
     * Delete a failed receipt upload
     * Clears a failed upload and its original image off the bench. Queued, processing, and succeeded uploads return 409; delete the receipt to remove a successful scan.
     * Responses:
     *  - 204: <No Content>
     *  - 404: No receipt upload is wearing that number, bud.
     *  - 409: Only failed uploads can be deleted; this upload has a different status.
     *  - 500: The server could not delete this upload and its stored image.
     *
     * @param uploadId 
     * @return [Unit]
     */
    @DELETE("receipt-uploads/{uploadId}")
    suspend fun receiptUploadsDelete(@Path("uploadId") uploadId: java.util.UUID): Response<Unit>

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
     * @return [ReceiptUploadsCreate202Response]
     */
    @GET("receipt-uploads/{uploadId}")
    suspend fun receiptUploadsGet(@Path("uploadId") uploadId: java.util.UUID): Response<ReceiptUploadsCreate202Response>

    /**
     * GET receipt-uploads
     * List receipt uploads
     * Pulls every receipt upload off the bench, newest first, with its current status.
     * Responses:
     *  - 200: Success
     *  - 500: The server could not pull the uploads off the bench.
     *
     * @return [ReceiptUploadsList200Response]
     */
    @GET("receipt-uploads")
    suspend fun receiptUploadsList(): Response<ReceiptUploadsList200Response>

}
