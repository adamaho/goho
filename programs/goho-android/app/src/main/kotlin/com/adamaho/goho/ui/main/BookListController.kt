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
 * list. A refresh that began before a deletion never restores the deleted book. Covers still on the
 * phone come from [pendingUploads] until a successful listing has them.
 */
internal class BookListController(
    private val scope: CoroutineScope,
    private val booksApi: BooksApi,
    private val uploadsApi: BookUploadsApi,
    private val deletions: PendingDeletions,
    private val pendingUploads: PendingUploads,
) {
    var state by mutableStateOf(BookListState())
        private set

    /** Pending deletions stay hidden even when an overlapping refresh still returns them. */
    val visibleState: BookListState
        get() =
            state.copy(
                books =
                    state.books.filterNot {
                        deletions.contains(DeletionKey(DeletionKind.Book, it.id))
                    },
                uploads =
                    state.uploads.filterNot {
                        it.status == BookUpload.Status.succeeded &&
                            it.bookId?.let { id ->
                                deletions.contains(DeletionKey(DeletionKind.Book, id))
                            } == true
                    },
                local = pendingUploads.entries.filter { it.kind == ScanKind.Book },
            )

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
        val accepted = pendingUploads.acceptedIds(ScanKind.Book)
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
                    ) {
                        pendingUploads.reconcile(
                            ScanKind.Book,
                            accepted + uploads.map { it.id },
                        )
                        BookListState(books = books, uploads = uploads, hasLoaded = true)
                    } else failed()
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

    /**
     * Polls while a scan is queued or processing, or accepted but not yet listed. Run it only while
     * the activity is started.
     */
    suspend fun pollPendingUploads() {
        snapshotFlow {
            state.uploads.any {
                it.status == BookUpload.Status.queued || it.status == BookUpload.Status.processing
            } || pendingUploads.acceptedIds(ScanKind.Book).isNotEmpty()
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
     * Accepts a confirmed deletion immediately; the activity-owned operation reconciles failures
     * before restoring the book. Raw data changes only once its absence is confirmed.
     */
    suspend fun delete(bookId: String): Boolean =
        deletions.start(DeletionKey(DeletionKind.Book, bookId)) {
            val deleted =
                deleteAndConfirm(
                    delete = { booksApi.booksDelete(bookId) },
                    lookup = { booksApi.booksGet(bookId) },
                )
            if (deleted) {
                changeRevision++
                state =
                    state.copy(
                        books = state.books.filterNot { it.id == bookId },
                        uploads =
                            state.uploads.filterNot {
                                it.status == BookUpload.Status.succeeded && it.bookId == bookId
                            },
                    )
            } else refresh()
            deleted
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
