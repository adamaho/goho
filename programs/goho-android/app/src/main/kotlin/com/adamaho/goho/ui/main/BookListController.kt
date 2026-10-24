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
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MultipartBody

/**
 * Books data owned by the activity, independent of receipts. Books and their cover scans refresh
 * together; a refresh joins or queues behind one already running, and a failure keeps the cached
 * list. A refresh that began before an accepted scan or a deletion never drops the scan or restores
 * the deleted book.
 */
internal class BookListController(
    private val scope: CoroutineScope,
    private val booksApi: BooksApi,
    private val uploadsApi: BookUploadsApi,
) {
    var state by mutableStateOf(BookListState())
        private set

    private var refreshAfterCurrent = false
    /** Counts local changes that a listing started earlier would miss. */
    private var changeRevision = 0L

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

        val revision = changeRevision
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
                    if (revision != changeRevision) reloadAfterChange()
                    else if (
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
                state = if (revision != changeRevision) reloadAfterChange() else failed()
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

    /**
     * Uploads a cover scan; only the server's 202 with a scan that hasn't failed counts as
     * accepted. The accepted scan joins the top of a loaded list right away, then the list
     * refreshes. Returns its ID, or null when the upload wasn't accepted.
     */
    suspend fun upload(cover: MultipartBody.Part): UUID? =
        try {
            val response = uploadsApi.bookUploadsCreate(cover)
            val upload = response.body()?.data
            if (
                response.code() == 202 &&
                    upload != null &&
                    upload.status != BookUpload.Status.failed
            ) {
                changeRevision++
                if (state.hasLoaded)
                    state =
                        state.copy(
                            uploads =
                                listOf(upload) + state.uploads.filterNot { it.id == upload.id }
                        )
                refresh()
                upload.id
            } else {
                Log.w("GohoBooks", "Book upload was not accepted: ${response.code()}")
                null
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoBooks", "Book upload failed", error)
            null
        }

    /**
     * Deletes a saved book; only the server's 204 counts as success. The book and its successful
     * scans, which the server deletes with it, leave the local list; every other row stays as is.
     */
    suspend fun delete(bookId: String): Boolean =
        try {
            val response = booksApi.booksDelete(bookId)
            if (response.code() == 204) {
                changeRevision++
                state =
                    state.copy(
                        books = state.books.filterNot { it.id == bookId },
                        uploads =
                            state.uploads.filterNot {
                                it.status == BookUpload.Status.succeeded && it.bookId == bookId
                            },
                    )
                true
            } else {
                Log.w("GohoBooks", "Book deletion failed: ${response.code()}")
                false
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoBooks", "Book deletion failed", error)
            false
        }

    /** The full-size cover for the book overlay and photo viewer, outside the thumbnail cache. */
    suspend fun loadFullCover(bookId: String): ImageBitmap? =
        loadCover(bookId)?.let { decodePhoto(it) }

    /**
     * A listing that began before a local change may still include a deleted book or miss an
     * accepted scan, so its result, success or failure, is dropped and the list reloads.
     */
    private fun reloadAfterChange(): BookListState {
        refreshAfterCurrent = true
        return state.copy(loading = false)
    }

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
