package com.adamaho.goho.ui.main

import android.text.format.DateFormat
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200ResponseDataInner
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlinx.coroutines.delay

data class ReceiptOverviewState(
    val uploads: List<ReceiptUploadsList200ResponseDataInner> = emptyList(),
    val receipts: List<Receipt> = emptyList(),
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
)

@Composable
fun ReceiptOverview(
    state: ReceiptOverviewState,
    isOpeningScanner: Boolean,
    @StringRes scanError: Int?,
    onScanClick: () -> Unit,
    onRetryClick: () -> Unit,
    onReceiptClick: (String) -> Unit,
    loadReceiptImage: suspend (String) -> ByteArray?,
    modifier: Modifier = Modifier,
    previewTime: Instant? = null,
) {
    val clock by
        produceState(initialValue = previewTime ?: Instant.now(), previewTime) {
            if (previewTime == null)
                while (true) {
                    value = Instant.now()
                    delay(30_000)
                }
        }
    val config = LocalConfiguration.current
    val locale = config.locales[0]
    val zone = ZoneId.systemDefault()
    val today = clock.atZone(zone).toLocalDate()
    val entries =
        remember(state.receipts, state.uploads, zone) {
            receiptListEntries(state.receipts, state.uploads, zone)
        }
    var attentionOnly by rememberSaveable { mutableStateOf(false) }
    val filtered = remember(entries, attentionOnly) { filterReceiptEntries(entries, attentionOnly) }
    val sections =
        remember(filtered, today, locale) { receiptListSections(filtered, today, locale) }
    val currentLoadImage by rememberUpdatedState(loadReceiptImage)
    val thumbnails = remember { ReceiptThumbnails { currentLoadImage(it) } }
    val listState = rememberLazyListState()
    LaunchedEffect(attentionOnly) { listState.scrollToItem(0) }
    val c = GohoTheme.colors
    Box(modifier.fillMaxSize().background(c.background).safeDrawingPadding()) {
        Column(Modifier.fillMaxSize()) {
            Box(
                Modifier.fillMaxWidth()
                    .padding(horizontal = GohoSpacing.textInset)
                    .padding(top = GohoSpacing.headerTop)
                    .heightIn(min = GohoSpacing.headerHeight),
                contentAlignment = Alignment.CenterStart,
            ) {
                Text(
                    stringResource(R.string.goho_wordmark),
                    style = GohoTheme.type.wordmark,
                    color = c.textPrimary,
                )
            }
            if (entries.isNotEmpty())
                ReceiptFilter(
                    entries.size,
                    entries.count { it.status == ReceiptListStatus.NotProcessed },
                    attentionOnly,
                    { attentionOnly = it },
                    locale,
                    Modifier.padding(horizontal = GohoSpacing.screenMargin)
                        .padding(top = GohoSpacing.filterTop, bottom = GohoSpacing.contentGap),
                )
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().headerFade(c.background),
                contentPadding =
                    PaddingValues(
                        start = GohoSpacing.screenMargin,
                        end = GohoSpacing.screenMargin,
                        bottom = GohoSpacing.listBottom,
                    ),
            ) {
                if (state.error)
                    item("load-error") {
                        ListNotice(
                            stringResource(R.string.receipts_load_failed),
                            stringResource(R.string.receipt_detail_retry),
                            onRetryClick,
                        )
                    }
                scanError?.let { error -> item("scan-error") { ListNotice(stringResource(error)) } }
                if (isOpeningScanner)
                    item("scanner") { ListNotice(stringResource(R.string.scan_opening)) }
                if (filtered.isEmpty())
                    item("empty") {
                        when {
                            !state.hasLoaded && (state.loading || !state.error) ->
                                ListNotice(stringResource(R.string.receipts_loading))
                            state.hasLoaded && !state.error ->
                                Column(
                                    Modifier.fillParentMaxHeight()
                                        .fillMaxWidth()
                                        .padding(horizontal = GohoSpacing.textInsetFromMargin),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    if (!attentionOnly || entries.isEmpty())
                                        Text(
                                            stringResource(R.string.receipts_empty_title),
                                            style = GohoTheme.type.rowTitle,
                                            color = c.textPrimary,
                                        )
                                    Spacer(Modifier.height(GohoSpacing.sectionLabelBottom))
                                    Text(
                                        stringResource(
                                            if (attentionOnly && entries.isNotEmpty())
                                                R.string.receipts_attention_empty
                                            else R.string.receipts_empty_body
                                        ),
                                        style = GohoTheme.type.meta,
                                        color = c.textTertiary,
                                    )
                                }
                        }
                    }
                sections.forEach { section ->
                    item("section:${section.group}") {
                        Column {
                            Text(
                                sectionTitle(section.group, locale, today.year),
                                style = GohoTheme.type.section,
                                color = c.textTertiary,
                                modifier =
                                    Modifier.padding(
                                            start = GohoSpacing.textInsetFromMargin,
                                            top = GohoSpacing.sectionTop,
                                            bottom = GohoSpacing.sectionLabelBottom,
                                        )
                                        .semantics { heading() },
                            )
                            ReceiptCard {
                                section.entries.forEachIndexed { index, entry ->
                                    key(entry.key) {
                                        ReceiptRow(
                                            entry,
                                            clock,
                                            locale,
                                            zone,
                                            config.fontScale >= 1.3f ||
                                                config.screenWidthDp <
                                                    GohoSpacing.compactWidth.value,
                                            onReceiptClick,
                                            thumbnails,
                                        )
                                        if (index < section.entries.lastIndex) ReceiptDivider()
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        ScanButton(
            !isOpeningScanner,
            onScanClick,
            Modifier.align(Alignment.BottomEnd)
                .padding(end = GohoSpacing.screenMargin, bottom = GohoSpacing.fabBottom),
        )
    }
}

@Composable
private fun sectionTitle(group: ReceiptDateGroup, locale: Locale, year: Int): String =
    when (group.period) {
        ReceiptDatePeriod.Today -> stringResource(R.string.date_today)
        ReceiptDatePeriod.Yesterday -> stringResource(R.string.date_yesterday)
        ReceiptDatePeriod.ThisWeek -> stringResource(R.string.date_this_week)
        ReceiptDatePeriod.LastWeek -> stringResource(R.string.date_last_week)
        ReceiptDatePeriod.Unknown -> stringResource(R.string.date_unknown)
        ReceiptDatePeriod.Month ->
            group.month!!.format(
                DateTimeFormatter.ofPattern(
                    DateFormat.getBestDateTimePattern(
                        locale,
                        if (group.month!!.year == year) "MMMM" else "MMMMyyyy",
                    ),
                    locale,
                )
            )
    }

@Composable
private fun ListNotice(message: String, action: String? = null, onAction: () -> Unit = {}) {
    val c = GohoTheme.colors
    Column(
        Modifier.fillMaxWidth()
            .padding(
                horizontal = GohoSpacing.textInsetFromMargin,
                vertical = GohoSpacing.contentGap,
            )
    ) {
        Text(
            message,
            style = GohoTheme.type.meta,
            color = c.textSecondary,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        if (action != null) {
            val interaction = remember { MutableInteractionSource() }
            val pressed by interaction.collectIsPressedAsState()
            Box(
                Modifier.heightIn(min = GohoSpacing.headerHeight)
                    .clip(GohoShapes.pill)
                    .background(if (pressed) c.surfaceMutedPressed else c.surfaceMuted)
                    .clickable(
                        interaction,
                        indication = null,
                        role = Role.Button,
                        onClick = onAction,
                    )
                    .padding(horizontal = GohoSpacing.cardPadding),
                contentAlignment = Alignment.Center,
            ) {
                Text(action, style = GohoTheme.type.button, color = c.textPrimary)
            }
        }
    }
}

@Composable
private fun ReceiptRow(
    entry: ReceiptListEntry,
    now: Instant,
    locale: Locale,
    zone: ZoneId,
    expanded: Boolean,
    onReceiptClick: (String) -> Unit,
    thumbnails: ReceiptThumbnails,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val title =
        entry.merchant
            ?: stringResource(
                if (entry.status == ReceiptListStatus.Processing) R.string.receipt_new
                else R.string.receipt_unknown
            )
    val today = now.atZone(zone).toLocalDate()
    val date =
        when (entry.date) {
            null -> stringResource(R.string.date_unknown)
            today -> stringResource(R.string.date_today)
            today.minusDays(1) -> stringResource(R.string.date_yesterday)
            else ->
                entry.date.format(
                    DateTimeFormatter.ofPattern(
                        DateFormat.getBestDateTimePattern(
                            locale,
                            if (entry.date.year == today.year) "EEEMMMd" else "EEEMMMdy",
                        ),
                        locale,
                    )
                )
        }
    val metadata =
        if (entry.uploadedAt != null && entry.date == today) {
            if (
                entry.status == ReceiptListStatus.Processing &&
                    entry.uploadedAt <= now &&
                    now.epochSecond - entry.uploadedAt.epochSecond < 60
            )
                stringResource(R.string.date_just_now)
            else
                "$date, ${entry.uploadedAt.atZone(zone).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))}"
        } else date
    val clickable =
        entry.receiptId?.let { id ->
            Modifier.clickable(
                interaction,
                indication = null,
                role = Role.Button,
                onClick = { onReceiptClick(id) },
            )
        } ?: Modifier
    Row(
        Modifier.fillMaxWidth()
            .then(clickable)
            .background(if (pressed) c.surfacePressed else c.surface)
            .heightIn(min = GohoSpacing.rowMinHeight)
            .semantics(mergeDescendants = true) {}
            .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.rowVertical),
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.thumbToText),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ReceiptThumbnail(entry.receiptId, thumbnails)
        Column(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(GohoSpacing.lineGap),
        ) {
            if (expanded) {
                Text(
                    title,
                    style = GohoTheme.type.rowTitle,
                    color =
                        if (entry.status == ReceiptListStatus.Processed) c.textPrimary
                        else c.textSecondary,
                )
                ReceiptRowAmount(entry, locale)
                Text(metadata, style = GohoTheme.type.meta, color = c.textTertiary)
                if (entry.status != ReceiptListStatus.Processed)
                    ReceiptStatusPill(entry.status == ReceiptListStatus.Processing)
            } else {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(GohoSpacing.contentGap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        title,
                        modifier = Modifier.weight(1f),
                        style = GohoTheme.type.rowTitle,
                        color =
                            if (entry.status == ReceiptListStatus.Processed) c.textPrimary
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
                        modifier = Modifier.weight(1f),
                        style = GohoTheme.type.meta,
                        color = c.textTertiary,
                    )
                    if (entry.status != ReceiptListStatus.Processed)
                        ReceiptStatusPill(entry.status == ReceiptListStatus.Processing)
                }
            }
        }
    }
}

@Composable
private fun ReceiptRowAmount(entry: ReceiptListEntry, locale: Locale) {
    val c = GohoTheme.colors
    if (entry.status == ReceiptListStatus.Processing) {
        Box(
            Modifier.size(GohoSpacing.skeletonWidth, GohoSpacing.skeletonHeight)
                .clip(GohoShapes.pill)
                .background(shimmerBrush(c.skeletonBase, c.skeletonShimmer))
        )
    } else {
        Text(
            entry.total?.let {
                listOfNotNull(entry.currency, receiptAmount(it, entry.currency, locale))
                    .joinToString(" ")
            } ?: "—",
            style = GohoTheme.type.rowTitle,
            color = if (entry.total == null) c.textTertiary else c.textPrimary,
        )
    }
}
