package com.adamaho.goho.ui.main

import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200ResponseDataInner
import java.math.RoundingMode
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters
import java.time.temporal.WeekFields
import java.util.Locale

enum class ReceiptListStatus {
    Processed,
    Processing,
    NotProcessed,
    /** Saved on this device and sending to the server. */
    Uploading,
    /** Saved on this device after the server didn't accept it; it can be retried or discarded. */
    UploadFailed,
}

data class ReceiptListEntry(
    val key: String,
    val receiptId: String?,
    val merchant: String?,
    val date: LocalDate?,
    val uploadedAt: Instant?,
    val total: String?,
    val currency: String?,
    val status: ReceiptListStatus,
    val uploadId: java.util.UUID? = null,
    val localId: java.util.UUID? = null,
)

val ReceiptListEntry.needsAttention: Boolean
    get() = status == ReceiptListStatus.NotProcessed || status == ReceiptListStatus.UploadFailed

enum class ReceiptDatePeriod {
    Today,
    Yesterday,
    ThisWeek,
    LastWeek,
    Month,
    Unknown,
}

data class ReceiptDateGroup(val period: ReceiptDatePeriod, val month: YearMonth? = null)

data class ReceiptListSection(val group: ReceiptDateGroup, val entries: List<ReceiptListEntry>)

fun receiptListEntries(
    receipts: List<Receipt>,
    uploads: List<ReceiptUploadsList200ResponseDataInner>,
    zone: ZoneId,
    local: List<LocalUpload> = emptyList(),
    keys: Map<java.util.UUID, String> = emptyMap(),
): List<ReceiptListEntry> {
    val completed =
        uploads
            .filter { it.status == ReceiptUploadsList200ResponseDataInner.Status.succeeded }
            .associateBy { it.receiptId }
    val saved = receipts.map { receipt ->
        val upload = completed[receipt.id]
        ReceiptListEntry(
            key = upload?.let { keys[it.id] ?: "upload:${it.id}" } ?: "receipt:${receipt.id}",
            receiptId = receipt.id,
            merchant = receipt.storeName,
            date = runCatching { LocalDate.parse(receipt.receiptDate) }.getOrNull(),
            uploadedAt = upload?.let { uploadInstant(it.createdAt) },
            total = receipt.total,
            currency = receipt.currency,
            status = ReceiptListStatus.Processed,
        )
    }
    val unfinished =
        uploads
            .filter { it.status != ReceiptUploadsList200ResponseDataInner.Status.succeeded }
            .map { upload ->
                val instant = uploadInstant(upload.createdAt)
                ReceiptListEntry(
                    key = keys[upload.id] ?: "upload:${upload.id}",
                    uploadId = upload.id,
                    receiptId = null,
                    merchant = null,
                    date = instant?.atZone(zone)?.toLocalDate(),
                    uploadedAt = instant,
                    total = null,
                    currency = null,
                    status =
                        if (upload.status == ReceiptUploadsList200ResponseDataInner.Status.failed)
                            ReceiptListStatus.NotProcessed
                        else ReceiptListStatus.Processing,
                )
            }
    val saving = local.map { upload ->
        ReceiptListEntry(
            key = upload.key,
            localId = upload.id,
            receiptId = null,
            merchant = null,
            date = upload.createdAt.atZone(zone).toLocalDate(),
            uploadedAt = upload.createdAt,
            total = null,
            currency = null,
            status =
                if (upload.uploading) ReceiptListStatus.Uploading
                else ReceiptListStatus.UploadFailed,
        )
    }
    // Stable ties preserve the server's newest-created-first order for manual receipts.
    return (saved + unfinished + saving).sortedWith(
        compareByDescending<ReceiptListEntry> { it.date }.thenByDescending { it.uploadedAt }
    )
}

fun receiptListSections(
    entries: List<ReceiptListEntry>,
    today: LocalDate,
    locale: Locale,
): List<ReceiptListSection> {
    val weekStart =
        today.with(TemporalAdjusters.previousOrSame(WeekFields.of(locale).firstDayOfWeek))
    return entries
        .groupBy { entry ->
            val date = entry.date
            when {
                date == null -> ReceiptDateGroup(ReceiptDatePeriod.Unknown)
                date == today -> ReceiptDateGroup(ReceiptDatePeriod.Today)
                date == today.minusDays(1) -> ReceiptDateGroup(ReceiptDatePeriod.Yesterday)
                date in weekStart..today -> ReceiptDateGroup(ReceiptDatePeriod.ThisWeek)
                date >= weekStart.minusWeeks(1) && date < weekStart ->
                    ReceiptDateGroup(ReceiptDatePeriod.LastWeek)
                else -> ReceiptDateGroup(ReceiptDatePeriod.Month, YearMonth.from(date))
            }
        }
        .map { (group, rows) -> ReceiptListSection(group, rows) }
}

/** Shared display formatting; preserve server precision in data and round only for display. */
fun receiptAmount(value: String?, locale: Locale): String {
    val amount = value?.toBigDecimalOrNull() ?: return "—"
    return NumberFormat.getNumberInstance(locale)
        .apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
            roundingMode = RoundingMode.HALF_EVEN
            isGroupingUsed = true
        }
        .format(amount)
}

/** PostgreSQL timestamptz::text uses a space separator and may shorten offsets to +00. */
internal fun uploadInstant(value: String): Instant? = runCatching {
    val timestamp = value.trim().replaceFirst(' ', 'T')
    val normalized =
        if (Regex("[+-]\\d{2}$").containsMatchIn(timestamp)) "$timestamp:00" else timestamp
    OffsetDateTime.parse(normalized).toInstant()
}
    .getOrNull()

fun filterReceiptEntries(
    entries: List<ReceiptListEntry>,
    attentionOnly: Boolean,
): List<ReceiptListEntry> = if (attentionOnly) entries.filter { it.needsAttention } else entries
