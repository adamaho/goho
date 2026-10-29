package com.adamaho.goho.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Shared receipt presentation for list rows and the persistent options-sheet header. */
@Composable
internal fun ReceiptSummary(
    entry: ReceiptListEntry?,
    now: Instant,
    locale: Locale,
    zone: ZoneId,
    expanded: Boolean,
    thumbnail: @Composable () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val title =
        if (entry == null) ""
        else
            entry.merchant
                ?: stringResource(
                    if (
                        entry.status == ReceiptListStatus.Processed ||
                            entry.status == ReceiptListStatus.NotProcessed
                    )
                        R.string.receipt_unknown
                    else R.string.receipt_new
                )
    val today = now.atZone(zone).toLocalDate()
    val date =
        when {
            entry == null -> ""
            entry.date == null -> stringResource(R.string.date_unknown)
            else -> relativeDate(entry.date, today, locale)
        }
    val justNow =
        (entry?.status == ReceiptListStatus.Processing ||
            entry?.status == ReceiptListStatus.Uploading) &&
            entry.uploadedAt != null &&
            entry.uploadedAt <= now &&
            now.epochSecond - entry.uploadedAt.epochSecond < 60
    val justNowLabel = stringResource(R.string.date_just_now)
    val metadata = buildAnnotatedString {
        if (
            entry?.uploadedAt != null &&
                entry.date == today &&
                entry.uploadedAt.atZone(zone).toLocalDate() == today
        ) {
            if (justNow) append(justNowLabel)
            else {
                append("$date, ")
                withStyle(GohoTheme.type.timestamp.toSpanStyle()) {
                    append(
                        entry.uploadedAt
                            .atZone(zone)
                            .format(
                                DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)
                                    .withLocale(locale)
                            )
                    )
                }
            }
        } else append(date)
    }
    Row(
        modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.thumbToText),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        thumbnail()
        Column(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(GohoSpacing.lineGap),
        ) {
            if (expanded) {
                Text(
                    title,
                    modifier = Modifier.skeleton(GohoSpacing.skeletonTitleWidth),
                    style = GohoTheme.type.rowTitle,
                    color =
                        if (entry?.status == ReceiptListStatus.Processed) c.textPrimary
                        else c.textSecondary,
                )
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                    ReceiptRowAmount(entry, locale)
                }
                ReceiptEntryTag(entry, Modifier.align(Alignment.End))
                Text(
                    metadata,
                    modifier = Modifier.skeleton(GohoSpacing.skeletonTitleWidth),
                    style = GohoTheme.type.meta,
                    color = c.textTertiary,
                )
            } else {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(GohoSpacing.contentGap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        title,
                        modifier = Modifier.weight(1f).skeleton(fraction = 0.8f),
                        style = GohoTheme.type.rowTitle,
                        color =
                            if (entry?.status == ReceiptListStatus.Processed) c.textPrimary
                            else c.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Box(Modifier.widthIn(max = GohoSpacing.amountMaxWidth)) {
                        ReceiptRowAmount(entry, locale)
                    }
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(GohoSpacing.sectionLabelBottom),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        metadata,
                        modifier = Modifier.weight(1f).skeleton(fraction = 0.55f),
                        style = GohoTheme.type.meta,
                        color = c.textTertiary,
                    )
                    ReceiptEntryTag(entry, Modifier.widthIn(max = GohoSpacing.tagMaxWidth))
                }
            }
        }
    }
}

@Composable
private fun ReceiptEntryTag(entry: ReceiptListEntry?, modifier: Modifier = Modifier) {
    when {
        entry == null ->
            Tag(
                label = "",
                icon = painterResource(R.drawable.ic_tag_other),
                color = TagColor.Grey,
                modifier = modifier.skeleton(GohoSpacing.skeletonWidth, block = true),
            )
        entry.status == ReceiptListStatus.Uploading -> LocalUploadTag(failed = false, modifier)
        entry.status == ReceiptListStatus.UploadFailed -> LocalUploadTag(failed = true, modifier)
        entry.status != ReceiptListStatus.Processed ->
            ReceiptUploadTag(entry.status == ReceiptListStatus.Processing, modifier)
    }
}

@Composable
private fun ReceiptRowAmount(entry: ReceiptListEntry?, locale: Locale) {
    val c = GohoTheme.colors
    if (
        entry?.status == ReceiptListStatus.Processing ||
            entry?.status == ReceiptListStatus.Uploading
    ) {
        Box(
            Modifier.size(GohoSpacing.skeletonWidth, GohoSpacing.skeletonHeight)
                .clip(GohoShapes.pill)
                .background(shimmerBrush(c.skeletonBase, c.skeletonShimmer))
        )
    } else {
        Text(
            receiptMoneyText(
                receiptAmount(entry?.total, locale),
                entry?.currency,
                locale,
                showCurrencyCode = true,
            ),
            modifier = Modifier.skeleton(GohoSpacing.skeletonWidth),
            style = GohoTheme.type.rowTitle,
            color = if (entry?.total == null) c.textTertiary else c.textPrimary,
        )
    }
}
