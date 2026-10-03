package com.adamaho.goho.ui.main

import android.text.format.DateFormat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import com.adamaho.goho.R
import com.adamaho.goho.theme.GohoSpacing
import com.adamaho.goho.theme.GohoTheme
import com.adamaho.goho.ui.components.ReceiptOptionsSheet
import com.adamaho.goho.ui.components.ReceiptStatusPill
import com.adamaho.goho.ui.components.receiptMoneyText
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

@Composable
internal fun ReceiptOptions(
    entry: ReceiptListEntry,
    locale: Locale,
    today: LocalDate,
    zone: ZoneId,
    thumbnail: @Composable () -> Unit,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
    onDeleted: () -> Unit = onDismiss,
) {
    val c = GohoTheme.colors
    val merchant =
        entry.merchant?.takeIf { it.isNotBlank() } ?: stringResource(R.string.receipt_unknown)
    val failed = entry.status == ReceiptListStatus.NotProcessed
    val uploadDate = entry.uploadedAt?.atZone(zone)
    val dateLabel =
        if (failed && uploadDate?.toLocalDate() == today)
            stringResource(
                R.string.date_today_time,
                uploadDate.format(
                    DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale)
                ),
            )
        else
            entry.date?.format(
                DateTimeFormatter.ofPattern(
                    DateFormat.getBestDateTimePattern(locale, "yMMMEd"),
                    locale,
                )
            ) ?: "—"
    ReceiptOptionsSheet(
        merchant = merchant,
        metadata = {
            if (failed) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(GohoSpacing.sectionLabelBottom),
                    verticalArrangement = Arrangement.spacedBy(GohoSpacing.sheetSummaryLineGap),
                ) {
                    ReceiptStatusPill(processing = false)
                    Text(
                        dateLabel,
                        style = GohoTheme.type.listRow,
                        color = c.textTertiary,
                        modifier = Modifier.align(Alignment.CenterVertically),
                    )
                }
            } else {
                Text(
                    buildAnnotatedString {
                        withStyle(
                            GohoTheme.type.listValue.copy(color = c.textPrimary).toSpanStyle()
                        ) {
                            append(
                                receiptMoneyText(
                                    receiptAmount(entry.total, locale),
                                    entry.currency,
                                    locale,
                                )
                            )
                        }
                        append("  ")
                        append(dateLabel)
                    },
                    style = GohoTheme.type.listRow,
                    color = c.textTertiary,
                )
            }
        },
        thumbnail = thumbnail,
        onDelete = onDelete,
        onDismiss = onDismiss,
        onDeleted = onDeleted,
    )
}
