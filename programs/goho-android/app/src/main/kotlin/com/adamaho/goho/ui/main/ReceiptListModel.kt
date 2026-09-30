package com.adamaho.goho.ui.main

import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200ResponseDataInner
import java.math.BigDecimal
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters
import java.time.temporal.WeekFields
import java.util.Currency
import java.util.Locale

enum class ReceiptListStatus {
    Processed,
    Processing,
    NotProcessed,
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
)

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
): List<ReceiptListEntry> {
    val completed =
        uploads
            .filter { it.status == ReceiptUploadsList200ResponseDataInner.Status.succeeded }
            .associateBy { it.receiptId }
    val saved = receipts.map { receipt ->
        val upload = completed[receipt.id]
        ReceiptListEntry(
            key = upload?.let { "upload:${it.id}" } ?: "receipt:${receipt.id}",
            receiptId = receipt.id,
            merchant = receipt.storeName,
            date = runCatching { LocalDate.parse(receipt.receiptDate) }.getOrNull(),
            uploadedAt = upload?.let { receiptUploadInstant(it.createdAt) },
            total = receipt.total,
            currency = receipt.currency,
            status = ReceiptListStatus.Processed,
        )
    }
    val unfinished =
        uploads
            .filter { it.status != ReceiptUploadsList200ResponseDataInner.Status.succeeded }
            .map { upload ->
                val instant = receiptUploadInstant(upload.createdAt)
                ReceiptListEntry(
                    key = "upload:${upload.id}",
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
    // Stable ties preserve the server's newest-created-first order for manual receipts.
    return (saved + unfinished).sortedWith(
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

/** Currency is optional in Goho and may be an unregistered three-letter code. */
fun receiptAmount(total: String, currencyCode: String?, locale: Locale): String {
    val amount = BigDecimal(total)
    val digits =
        currencyCode
            ?.let { runCatching { Currency.getInstance(it).defaultFractionDigits }.getOrNull() }
            ?.takeIf { it >= 0 } ?: 2
    val format =
        NumberFormat.getNumberInstance(locale).apply {
            minimumFractionDigits = digits
            maximumFractionDigits = maxOf(digits, amount.stripTrailingZeros().scale())
        }
    return format.format(amount)
}

/** PostgreSQL timestamptz::text uses a space separator and may shorten offsets to +00. */
internal fun receiptUploadInstant(value: String): Instant? = runCatching {
    val timestamp = value.trim().replaceFirst(' ', 'T')
    val normalized =
        if (Regex("[+-]\\d{2}$").containsMatchIn(timestamp)) "$timestamp:00" else timestamp
    OffsetDateTime.parse(normalized).toInstant()
}
    .getOrNull()

fun filterReceiptEntries(
    entries: List<ReceiptListEntry>,
    attentionOnly: Boolean,
): List<ReceiptListEntry> =
    if (attentionOnly) entries.filter { it.status == ReceiptListStatus.NotProcessed } else entries
