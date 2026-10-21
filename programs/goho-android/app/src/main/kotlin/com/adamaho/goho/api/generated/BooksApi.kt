package com.adamaho.goho.api.generated

import com.adamaho.goho.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import okhttp3.ResponseBody
import com.squareup.moshi.Json

import com.adamaho.goho.api.generated.model.BookConflictEncoded
import com.adamaho.goho.api.generated.model.BookImageNotFoundEncoded
import com.adamaho.goho.api.generated.model.BookNotFoundEncoded
import com.adamaho.goho.api.generated.model.BooksCreate200Response
import com.adamaho.goho.api.generated.model.BooksGet200Response
import com.adamaho.goho.api.generated.model.BooksList200Response
import com.adamaho.goho.api.generated.model.BooksUnavailableEncoded
import com.adamaho.goho.api.generated.model.CreateBookRequest
import com.adamaho.goho.api.generated.model.PatchBookRequest

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

    /**
     * DELETE books/{bookId}
     * Delete a book
     * Takes the book off the roster for good, along with every successful cover scan of it, their images, and extraction data. Its category stays. Returns no body after a clean finish.
     * Responses:
     *  - 204: <No Content>
     *  - 400: The book ID is malformed or out of range; the response body stays empty.
     *  - 404: No book is wearing that number, bud.
     *  - 500: The server could not delete this book and its stored images; take another shot to finish the cleanup.
     *
     * @param bookId 
     * @return [Unit]
     */
    @DELETE("books/{bookId}")
    suspend fun booksDelete(@Path("bookId") bookId: kotlin.String): Response<Unit>

    /**
     * GET books/{bookId}
     * Get a book
     * 
     * Responses:
     *  - 200: Success
     *  - 400: The book ID is malformed or out of range; the response body stays empty.
     *  - 404: No book is wearing that number, bud.
     *  - 500: The server could not retrieve this book.
     *
     * @param bookId 
     * @return [BooksGet200Response]
     */
    @GET("books/{bookId}")
    suspend fun booksGet(@Path("bookId") bookId: kotlin.String): Response<BooksGet200Response>

    /**
     * GET books/{bookId}/image
     * Get a book cover image
     * Returns the cover scan on file for the book. Books entered by hand have none until a scan of them succeeds.
     * Responses:
     *  - 200: Success
     *  - 400: The book ID is malformed or out of range; the response body stays empty.
     *  - 404: No cover is on file for that book number, bud.
     *  - 500: The server could not retrieve this cover image.
     *
     * @param bookId 
     * @return [ResponseBody]
     */
    @GET("books/{bookId}/image")
    suspend fun booksGetImage(@Path("bookId") bookId: kotlin.String): Response<ResponseBody>

    /**
     * GET books
     * List books
     * Pulls saved books off the bench, newest first. Add &#x60;search&#x60; to find title or author matches for autocomplete.
     * Responses:
     *  - 200: Success
     *  - 400: The query is a bad pass, such as `search` sent more than once; the response body stays empty.
     *  - 500: The server could not pull the books off the bench.
     *
     * @param search  (optional)
     * @return [BooksList200Response]
     */
    @GET("books")
    suspend fun booksList(@Query("search") search: kotlin.String? = null): Response<BooksList200Response>

    /**
     * PATCH books/{bookId}
     * Correct a book
     * Updates the supplied fields and returns the complete book. An unfamiliar category name joins the roster. Matching another book&#39;s title and author returns 409; books are never merged.
     * Responses:
     *  - 200: Success
     *  - 400: The correction is a bad pass: empty, blank, or unsupported fields, or a malformed ID. Nothing is saved.
     *  - 404: No book is wearing that number, bud.
     *  - 409: Another book on the roster already has that title and author. Nothing changed and nothing merged.
     *  - 500: The server could not save this correction; nothing changed.
     *
     * @param bookId 
     * @param patchBookRequest 
     * @return [BooksGet200Response]
     */
    @PATCH("books/{bookId}")
    suspend fun booksPatch(@Path("bookId") bookId: kotlin.String, @Body patchBookRequest: PatchBookRequest): Response<BooksGet200Response>

}
