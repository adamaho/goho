package com.adamaho.goho.ui.main

import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.api.generated.model.BookUpload
import com.adamaho.goho.ui.components.ScanStatus
import com.adamaho.goho.ui.components.failed
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

    /** A scan on the phone or the server; both use the server upload's key. */
    data class Scan(val uploadId: UUID, val status: ScanStatus, val uploadedAt: Instant?) :
        BookListEntry {
        override val key = "upload:$uploadId"
    }
}

val BookListEntry.needsAttention: Boolean
    get() = this is BookListEntry.Scan && status.failed

/**
 * Scans without a book come first, newest first, keeping server order for equal times: photos still
 * on the phone that the server hasn't listed, then unfinished and failed server scans. Saved books
 * follow A–Z by title for [locale], ignoring case. Books with equal titles keep server order. A
 * succeeded scan is shown as its book, which several scans can share.
 */
fun bookListEntries(
    books: List<Book>,
    uploads: List<BookUpload>,
    locale: Locale,
    local: List<PendingUpload> = emptyList(),
): List<BookListEntry> {
    val titles = Collator.getInstance(locale).apply { strength = Collator.SECONDARY }
    val listed = uploads.mapTo(HashSet()) { it.id }
    val sending =
        local
            .filter { it.id !in listed }
            .map {
                BookListEntry.Scan(
                    uploadId = it.id,
                    status =
                        if (it.state == TransferState.Failed) ScanStatus.UploadFailed
                        else ScanStatus.Uploading,
                    uploadedAt = it.createdAt,
                )
            }
    val scans =
        uploads
            .filter { it.status != BookUpload.Status.succeeded }
            .map {
                BookListEntry.Scan(
                    uploadId = it.id,
                    status =
                        if (it.status == BookUpload.Status.failed) ScanStatus.NotProcessed
                        else ScanStatus.Processing,
                    uploadedAt = uploadInstant(it.createdAt),
                )
            }
    return (sending + scans).sortedWith(
        compareByDescending<BookListEntry.Scan, Instant?>(nullsFirst()) { it.uploadedAt }
    ) + books.sortedWith(compareBy(titles) { it.title }).map(BookListEntry::Saved)
}
