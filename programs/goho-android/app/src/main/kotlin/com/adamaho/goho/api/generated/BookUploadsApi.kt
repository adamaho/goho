package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.BookUploadsCreate202Response
import com.adamaho.goho.api.generated.model.BookUploadsUnavailable

import okhttp3.MultipartBody

interface BookUploadsApi {
    /**
     * POST book-uploads
     * Upload a book cover
     * Stores one cover image and returns its queued status before processing starts. A clean scan saves the book, or finds it already on the roster without changing it.
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

}
