package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.BookUploadConflict
import com.adamaho.goho.api.generated.model.BookUploadNotFound
import com.adamaho.goho.api.generated.model.BookUploadsCreate202Response
import com.adamaho.goho.api.generated.model.BookUploadsGet200Response
import com.adamaho.goho.api.generated.model.BookUploadsList200Response
import com.adamaho.goho.api.generated.model.BookUploadsUnavailable

import okhttp3.MultipartBody

interface BookUploadsApi {
    /**
     * POST book-uploads
     * Upload a book cover
     * Stores one cover image and returns its queued status before processing starts. A clean scan saves the book, or finds it already on the roster without changing it. No author on the cover? The publisher printed there steps in, and with neither the author stays null.
     * Responses:
     *  - 202: Success
     *  - 400: The upload is missing a supported cover image.
     *  - 500: The server could not store or queue the cover image.
     *
     * @param file 
     * @return [BookUploadsCreate202Response]
     */
    @Multipart
    @POST("book-uploads")
    suspend fun bookUploadsCreate(@Part file: MultipartBody.Part): Response<BookUploadsCreate202Response>

    /**
     * DELETE book-uploads/{uploadId}
     * Delete a failed book cover upload
     * Clears a failed scan and its original image off the bench. Queued, processing, and succeeded scans return 409; delete the book to remove its successful scans.
     * Responses:
     *  - 204: <No Content>
     *  - 400: The upload ID is not a version 4 UUID; the response body stays empty.
     *  - 404: No cover scan is wearing that number, bud.
     *  - 409: Only failed scans can be deleted; this one is queued, processing, or succeeded. Nothing changed.
     *  - 500: The server could not delete this scan and its stored image.
     *
     * @param uploadId 
     * @return [Unit]
     */
    @DELETE("book-uploads/{uploadId}")
    suspend fun bookUploadsDelete(@Path("uploadId") uploadId: java.util.UUID): Response<Unit>

    /**
     * GET book-uploads/{uploadId}
     * Get book cover upload status
     * Returns the latest queue or processing status and the book ID after a clean finish.
     * Responses:
     *  - 200: Success
     *  - 400: The upload ID is not a version 4 UUID; the response body stays empty.
     *  - 404: No cover scan is wearing that number, bud.
     *  - 500: The server could not retrieve this cover scan.
     *
     * @param uploadId 
     * @return [BookUploadsGet200Response]
     */
    @GET("book-uploads/{uploadId}")
    suspend fun bookUploadsGet(@Path("uploadId") uploadId: java.util.UUID): Response<BookUploadsGet200Response>

    /**
     * GET book-uploads
     * List book cover uploads
     * Pulls every cover scan off the bench, newest first, with its current status.
     * Responses:
     *  - 200: Success
     *  - 500: The server could not pull the cover scans off the bench.
     *
     * @return [BookUploadsList200Response]
     */
    @GET("book-uploads")
    suspend fun bookUploadsList(): Response<BookUploadsList200Response>

}
