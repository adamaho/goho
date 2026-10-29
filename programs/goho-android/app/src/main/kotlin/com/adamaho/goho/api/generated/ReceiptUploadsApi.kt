package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.Conflict
import com.adamaho.goho.api.generated.model.Gone
import com.adamaho.goho.api.generated.model.InternalServerError
import com.adamaho.goho.api.generated.model.NotFound
import com.adamaho.goho.api.generated.model.ReceiptUploadsCreate202Response
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200Response

import okhttp3.MultipartBody

interface ReceiptUploadsApi {
    /**
     * POST receipt-uploads
     * Upload a receipt image
     * Stores one receipt image and returns its queued status before processing starts. An optional &#x60;idempotencyKey&#x60; part, a version 4 UUID sent before &#x60;file&#x60;, becomes the upload&#39;s ID so a retry can&#39;t double up: repeating it returns that upload as it stands now, even succeeded or failed, without storing another image or queueing more work. Once that upload is deleted, its key returns 410.
     * Responses:
     *  - 202: Success
     *  - 400: The upload is missing a supported receipt image, or its idempotency key is not a version 4 UUID.
     *  - 410: That idempotency key's upload was already accepted and has since been deleted; keys are never reused. Nothing was stored.
     *  - 500: The server could not store or queue the receipt image.
     *
     * @param idempotencyKey  (optional)
     * @param file 
     * @return [ReceiptUploadsCreate202Response]
     */
    @Multipart
    @POST("receipt-uploads")
    suspend fun receiptUploadsCreate(@Part("idempotencyKey") idempotencyKey: java.util.UUID? = null, @Part file: MultipartBody.Part): Response<ReceiptUploadsCreate202Response>

    /**
     * DELETE receipt-uploads/{uploadId}
     * Delete a failed receipt upload
     * Clears a failed upload and its original image off the bench. Queued, processing, and succeeded uploads return 409; delete the receipt to remove a successful scan.
     * Responses:
     *  - 204: <No Content>
     *  - 400: The upload ID is not a version 4 UUID; the response body stays empty.
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
     *  - 400: The upload ID is not a version 4 UUID; the response body stays empty.
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
