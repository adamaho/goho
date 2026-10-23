package com.adamaho.goho.ui.main

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.graphics.ImageBitmap
import com.adamaho.goho.api.generated.BookUploadsApi
import com.adamaho.goho.api.generated.BooksApi
import com.adamaho.goho.api.generated.model.BookUpload
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Books data owned by the activity, independent of receipts. Books and their cover scans refresh
 * together; a refresh joins or queues behind one already running, and a failure keeps the cached
 * list.
 */
internal class BookListController(
    private val scope: CoroutineScope,
    private val booksApi: BooksApi,
    private val uploadsApi: BookUploadsApi,
) {
    var state by mutableStateOf(BookListState())
        private set

    private var refreshAfterCurrent = false

    /** Keeps loaded covers across section switches; only books with a cover request one. */
    val covers = ThumbnailCache(::loadCover)

    fun refresh(userInitiated: Boolean = false) {
        if (state.loading) {
            if (userInitiated) {
                // Join the in-flight request instead of scheduling a duplicate pull refresh.
                state = state.copy(refreshing = true, refreshError = false)
            } else refreshAfterCurrent = true
            return
        }

        state = state.copy(loading = true, refreshing = userInitiated, refreshError = false)
        scope.launch {
            try {
                // A scan succeeds in the same transaction that saves its book, so listing scans
                // first guarantees every succeeded scan's book is in the following list.
                val uploadsResponse = uploadsApi.bookUploadsList()
                val booksResponse = booksApi.booksList()
                val uploads = uploadsResponse.body()?.data
                val books = booksResponse.body()?.data
                state =
                    if (
                        uploadsResponse.isSuccessful &&
                            booksResponse.isSuccessful &&
                            uploads != null &&
                            books != null
                    )
                        BookListState(books = books, uploads = uploads, hasLoaded = true)
                    else failed()
            } catch (error: Exception) {
                if (error is CancellationException) throw error
                Log.w("GohoBooks", "Book listing failed", error)
                state = failed()
            } finally {
                if (refreshAfterCurrent) {
                    refreshAfterCurrent = false
                    refresh(userInitiated = state.refreshing)
                }
            }
        }
    }

    /** Polls while a scan is queued or processing. Run it only while the activity is started. */
    suspend fun pollPendingUploads() {
        snapshotFlow {
            state.uploads.any {
                it.status == BookUpload.Status.queued || it.status == BookUpload.Status.processing
            }
        }
            .collectLatest { hasPendingUploads ->
                if (hasPendingUploads) {
                    while (true) {
                        delay(5_000)
                        if (!state.loading) refresh()
                    }
                }
            }
    }

    /** The full-size cover for the book overlay and photo viewer, outside the thumbnail cache. */
    suspend fun loadFullCover(bookId: String): ImageBitmap? =
        loadCover(bookId)?.let { decodePhoto(it) }

    private fun failed() =
        state.copy(
            loading = false,
            refreshing = false,
            error = !state.hasLoaded,
            refreshError = state.hasLoaded,
        )

    private suspend fun loadCover(bookId: String): ByteArray? =
        try {
            val response = booksApi.booksGetImage(bookId)
            when {
                response.code() == 404 -> null
                response.isSuccessful ->
                    withContext(Dispatchers.IO) { response.body()?.use { it.bytes() } }
                else -> {
                    Log.w("GohoBooks", "Book cover request failed: ${response.code()}")
                    null
                }
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoBooks", "Book cover failed to load", error)
            null
        }
}
