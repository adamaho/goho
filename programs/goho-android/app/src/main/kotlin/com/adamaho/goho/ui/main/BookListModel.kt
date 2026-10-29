package com.adamaho.goho.ui.main

import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.api.generated.model.BookUpload
import java.text.Collator
import java.time.Instant
import java.util.Locale
import java.util.UUID

/**
 * One Books row: a saved book, a cover scan that has not produced one, or a scan on this device
 * that the server hasn't accepted.
 */
sealed interface BookListEntry {
    val key: String

    data class Saved(val book: Book) : BookListEntry {
        override val key = "book:${book.id}"
    }

    data class Scan(
        val uploadId: UUID,
        val failed: Boolean,
        val uploadedAt: Instant?,
        override val key: String = "upload:$uploadId",
    ) : BookListEntry

    data class Local(val upload: LocalUpload) : BookListEntry {
        override val key = upload.key
    }
}

val BookListEntry.needsAttention: Boolean
    get() =
        (this is BookListEntry.Scan && failed) || (this is BookListEntry.Local && !upload.uploading)

/**
 * This device's [local] scans come first, then unfinished and failed scans in server order, newest
 * first, then saved books A–Z by title for [locale], ignoring case. Books with equal titles keep
 * server order. A succeeded scan is shown as its book, which several scans can share. A scan
 * accepted from this device keeps its local row's key from [keys].
 */
fun bookListEntries(
    books: List<Book>,
    uploads: List<BookUpload>,
    locale: Locale,
    local: List<LocalUpload> = emptyList(),
    keys: Map<UUID, String> = emptyMap(),
): List<BookListEntry> {
    val titles = Collator.getInstance(locale).apply { strength = Collator.SECONDARY }
    return local.map(BookListEntry::Local) +
        uploads
            .filter { it.status != BookUpload.Status.succeeded }
            .map {
                BookListEntry.Scan(
                    uploadId = it.id,
                    failed = it.status == BookUpload.Status.failed,
                    uploadedAt = uploadInstant(it.createdAt),
                    key = keys[it.id] ?: "upload:${it.id}",
                )
            } +
        books.sortedWith(compareBy(titles) { it.title }).map(BookListEntry::Saved)
}
