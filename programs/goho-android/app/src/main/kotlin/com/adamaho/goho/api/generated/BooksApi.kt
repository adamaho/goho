package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.BooksCreate200Response
import com.adamaho.goho.api.generated.model.BooksUnavailable
import com.adamaho.goho.api.generated.model.CreateBookRequest

interface BooksApi {
    /**
     * POST books
     * Add a book
     * Puts a book on the roster, adding an unfamiliar category too. When a saved book already has that title and author, ignoring case and extra spaces, you get that book back as saved and nothing else changes.
     * Responses:
     *  - 200: Success
     *  - 400: The payload is a bad pass: missing, blank, or unsupported fields. Nothing is saved.
     *  - 500: The server could not save this book; nothing changed.
     *
     * @param createBookRequest 
     * @return [BooksCreate200Response]
     */
    @POST("books")
    suspend fun booksCreate(@Body createBookRequest: CreateBookRequest): Response<BooksCreate200Response>

}
