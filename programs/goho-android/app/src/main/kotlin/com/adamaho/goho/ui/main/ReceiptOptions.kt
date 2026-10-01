package com.adamaho.goho.ui.main

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.ui.components.ReceiptOptionsSheet
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Currency
import java.util.Locale

@Composable
internal fun ReceiptOptions(
    entry: ReceiptListEntry,
    locale: Locale,
    today: LocalDate,
    zone: ZoneId,
    thumbnails: ReceiptThumbnails,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
) {
    fun date(pattern: String) =
        entry.date?.format(
            DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, pattern), locale)
        )
    val merchant =
        entry.merchant?.takeIf { it.isNotBlank() } ?: stringResource(R.string.receipt_unknown)
    val amount =
        entry.total?.let {
            val prefix =
                entry.currency
                    ?.let { code ->
                        runCatching { Currency.getInstance(code).getSymbol(locale) }
                            .getOrDefault(code)
                    }
                    .orEmpty()
            "$prefix${if (prefix.lastOrNull()?.isLetter() == true) " " else ""}${receiptAmount(it, locale)}"
        }
    val shortDate = date(if (entry.date?.year == today.year) "MMMd" else "yMMMd")
    val uploadDate = entry.uploadedAt?.atZone(zone)
    val uploaded =
        if (uploadDate?.toLocalDate() == today)
            stringResource(
                R.string.receipt_uploaded_today,
                uploadDate.format(
                    DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale)
                ),
            )
        else shortDate?.let { stringResource(R.string.receipt_uploaded_on, it) }
    val failed = entry.status == ReceiptListStatus.NotProcessed
    val summary =
        if (failed)
            uploaded?.let { stringResource(R.string.receipt_not_processed_summary, it) }
                ?: stringResource(R.string.receipt_not_processed)
        else listOfNotNull(amount, date("yMMMd")).joinToString(", ")
    val subject =
        if (failed && entry.merchant.isNullOrBlank()) {
            listOfNotNull(
                    stringResource(R.string.receipt_unprocessed),
                    (if (uploadDate?.toLocalDate() == today) uploaded else shortDate)?.let {
                        stringResource(R.string.receipt_delete_from, it)
                    },
                )
                .joinToString(" ")
        } else {
            val nameAmount = listOfNotNull(merchant, amount).joinToString(", ")
            shortDate?.let { stringResource(R.string.receipt_delete_description, nameAmount, it) }
                ?: nameAmount
        }
    ReceiptOptionsSheet(
        merchant,
        summary,
        stringResource(R.string.receipt_delete_body, subject),
        thumbnail = { ReceiptThumbnail(entry.receiptId, entry.status, thumbnails) },
        onDelete = onDelete,
        onDismiss = onDismiss,
    )
}
