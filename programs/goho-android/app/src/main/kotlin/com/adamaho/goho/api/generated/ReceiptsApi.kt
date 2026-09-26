package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.CreateReceiptRequest
import com.adamaho.goho.api.generated.model.EffectHttpApiErrorConflictEncoded
import com.adamaho.goho.api.generated.model.EffectHttpApiErrorInternalServerErrorEncoded
import com.adamaho.goho.api.generated.model.EffectHttpApiErrorNotFoundEncoded
import com.adamaho.goho.api.generated.model.ReceiptsCreate200Response
import com.adamaho.goho.api.generated.model.ReceiptsGet200Response
import com.adamaho.goho.api.generated.model.ReceiptsList200Response

interface ReceiptsApi {
    /**
     * POST receipts
     * Create a receipt
     * Creates the receipt and items in one clean play. Reuse the key with the same normalized data and the saved receipt comes back.
     * Responses:
     *  - 200: Success
     *  - 400: The `idempotency-key` header or payload is a bad pass; the response body stays empty.
     *  - 409: That idempotency key is already skating with different normalized receipt data or item order.
     *  - 500: Receipt validation or persistence missed the net.
     *
     * @param idempotencyKey Your receipt-creation play call, bud. It stays unique across receipts, never expires, and treats case and whitespace as different inputs.
     * @param createReceiptRequest 
     * @return [ReceiptsCreate200Response]
     */
    @POST("receipts")
    suspend fun receiptsCreate(@Header("idempotency-key") idempotencyKey: kotlin.String, @Body createReceiptRequest: CreateReceiptRequest): Response<ReceiptsCreate200Response>

    /**
     * GET receipts/{receiptId}
     * Get a receipt
     * Brings back one saved receipt with its items lined up by position.
     * Responses:
     *  - 200: Success
     *  - 404: No receipt is wearing that number, bud.
     *  - 500: The server could not retrieve this receipt.
     *
     * @param receiptId 
     * @return [ReceiptsGet200Response]
     */
    @GET("receipts/{receiptId}")
    suspend fun receiptsGet(@Path("receiptId") receiptId: kotlin.String): Response<ReceiptsGet200Response>

    /**
     * GET receipts
     * List receipts
     * Pulls every saved receipt off the bench, newest first, with its items in position order.
     * Responses:
     *  - 200: Success
     *  - 500: The server could not pull the receipts off the bench.
     *
     * @return [ReceiptsList200Response]
     */
    @GET("receipts")
    suspend fun receiptsList(): Response<ReceiptsList200Response>

}
