package com.adamaho.goho.ui.main

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.api.generated.model.BookNotFound
import com.adamaho.goho.api.generated.model.BooksGet200Response
import com.adamaho.goho.api.isNotFound
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import retrofit2.Response

/** What adding an author came to, once the server's answer is as certain as it can be. */
internal sealed interface AuthorOutcome {
    /** The server's book, with this author or one that reached it first. */
    data class Saved(val book: Book) : AuthorOutcome

    /** Another book already has this title and author; nothing changed. */
    data object Conflict : AuthorOutcome

    /** The book is gone. */
    data object Missing : AuthorOutcome

    /** Not saved, or it couldn't be confirmed; [unanswered] when no request got a response. */
    data class Failed(val unanswered: Boolean) : AuthorOutcome
}

/**
 * Authors being added to books, keyed by book ID, as [PendingDeletions] keeps deletions: requests
 * belong to the activity and outlive the sheet. A pending author is laid over the live data rather
 * than written into it, so a refresh can't erase it and a failure only has to drop it. The caller
 * commits the server's book to its raw data before the author is released.
 */
internal class PendingAuthors(private val scope: CoroutineScope) {
    private var pending by mutableStateOf(emptyMap<String, String>())

    fun author(bookId: String): String? = pending[bookId]

    /** A book with an author already pending sends no second request. */
    fun start(bookId: String, author: String, operation: suspend () -> Unit) {
        if (bookId in pending) return
        pending = pending + (bookId to author)
        scope.launch {
            try {
                operation()
            } finally {
                pending = pending - bookId
            }
        }
    }
}

/**
 * Sends one author correction. A lost or failed response is not proof that nothing changed, so the
 * book is looked up before reporting failure: an author on it means the save, or another one, got
 * there. With [lookupFirst], as for Try again, an author already on the book is kept instead of
 * being overwritten; PATCH itself is unconditional, so this narrows the race rather than closing
 * it. Only a `BookNotFound` 404 means the book is gone; any other 404 is an uncertain answer.
 */
internal suspend fun patchAndConfirm(
    patch: suspend () -> Response<BooksGet200Response>,
    lookup: suspend () -> Response<BooksGet200Response>,
    lookupFirst: Boolean,
): AuthorOutcome {
    /** A response whose error body has been read and closed; [missing] for `BookNotFound`. */
    class Sent(val response: Response<BooksGet200Response>, val missing: Boolean) {
        val book
            get() = response.body()?.data?.takeIf { response.isSuccessful }
    }

    suspend fun send(request: suspend () -> Response<BooksGet200Response>): Sent? =
        try {
            val response = request()
            Sent(response, missing = response.isNotFound(BookNotFound.serializer()))
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            Log.w("GohoBooks", "Author request failed", error)
            null
        }

    suspend fun confirm(unanswered: Boolean): AuthorOutcome {
        val found = send(lookup)
        val book = found?.book
        return when {
            found?.missing == true -> AuthorOutcome.Missing
            book?.author != null -> AuthorOutcome.Saved(book)
            else -> AuthorOutcome.Failed(unanswered && found == null)
        }
    }

    if (lookupFirst) {
        val found = send(lookup)
        if (found?.missing == true) return AuthorOutcome.Missing
        found
            ?.book
            ?.takeIf { it.author != null }
            ?.let {
                return AuthorOutcome.Saved(it)
            }
    }
    val result = send(patch) ?: return confirm(unanswered = true)
    val saved = result.book
    return when {
        saved != null -> AuthorOutcome.Saved(saved)
        result.response.code() == 409 -> AuthorOutcome.Conflict
        result.missing -> AuthorOutcome.Missing
        result.response.code() == 400 -> AuthorOutcome.Failed(unanswered = false)
        else -> confirm(unanswered = false)
    }
}
