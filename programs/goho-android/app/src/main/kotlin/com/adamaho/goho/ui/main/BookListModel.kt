package com.adamaho.goho.ui.main

import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.api.generated.model.BookUpload
import java.text.Collator
import java.time.Instant
import java.util.Locale
import java.util.UUID

/** One Books row: a saved book, or a cover scan that has not produced one. */
sealed interface BookListEntry {
    val key: String

    data class Saved(val book: Book) : BookListEntry {
        override val key = "book:${book.id}"
    }

    data class Scan(val uploadId: UUID, val failed: Boolean, val uploadedAt: Instant?) :
        BookListEntry {
        override val key = "upload:$uploadId"
    }
}

val BookListEntry.needsAttention: Boolean
    get() = this is BookListEntry.Scan && failed

/**
 * Unfinished and failed scans come first in server order, newest first, then saved books A–Z by
 * title for [locale], ignoring case. Books with equal titles keep server order. A succeeded scan is
 * shown as its book, which several scans can share.
 */
fun bookListEntries(
    books: List<Book>,
    uploads: List<BookUpload>,
    locale: Locale,
): List<BookListEntry> {
    val titles = Collator.getInstance(locale).apply { strength = Collator.SECONDARY }
    return uploads
        .filter { it.status != BookUpload.Status.succeeded }
        .map {
            BookListEntry.Scan(
                uploadId = it.id,
                failed = it.status == BookUpload.Status.failed,
                uploadedAt = uploadInstant(it.createdAt),
            )
        } + books.sortedWith(compareBy(titles) { it.title }).map(BookListEntry::Saved)
}
