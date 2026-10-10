package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import okhttp3.ResponseBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.CreateReceiptRequest
import com.adamaho.goho.api.generated.model.EffectHttpApiErrorInternalServerErrorEncoded
import com.adamaho.goho.api.generated.model.EffectHttpApiErrorNotFoundEncoded
import com.adamaho.goho.api.generated.model.ReceiptsCreate200Response
import com.adamaho.goho.api.generated.model.ReceiptsGet200Response
import com.adamaho.goho.api.generated.model.ReceiptsList200Response

interface ReceiptsApi {
    /**
     * POST receipts
     * Create a receipt
     * Creates the receipt and items in one clean play. Every call saves a new receipt.
     * Responses:
     *  - 200: Success
     *  - 400: The payload is a bad pass; the response body stays empty.
     *  - 500: Receipt validation or persistence missed the net.
     *
     * @param createReceiptRequest 
     * @return [ReceiptsCreate200Response]
     */
    @POST("receipts")
    suspend fun receiptsCreate(@Body createReceiptRequest: CreateReceiptRequest): Response<ReceiptsCreate200Response>

    /**
     * DELETE receipts/{receiptId}
     * Delete a receipt
     * Permanently removes the receipt, items, upload record, original image, and extraction data. Returns no body after a clean finish.
     * Responses:
     *  - 204: <No Content>
     *  - 404: No receipt is wearing that number, bud.
     *  - 500: The server could not delete this receipt and its stored image.
     *
     * @param receiptId 
     * @return [Unit]
     */
    @DELETE("receipts/{receiptId}")
    suspend fun receiptsDelete(@Path("receiptId") receiptId: kotlin.String): Response<Unit>

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
     * GET receipts/{receiptId}/image
     * Get a receipt image
     * Returns the scanned image for an uploaded receipt. Manually created receipts may not have one.
     * Responses:
     *  - 200: Success
     *  - 404: No scanned image is linked to this receipt, bud.
     *  - 500: The server could not retrieve this receipt image.
     *
     * @param receiptId 
     * @return [ResponseBody]
     */
    @GET("receipts/{receiptId}/image")
    suspend fun receiptsGetImage(@Path("receiptId") receiptId: kotlin.String): Response<ResponseBody>

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
