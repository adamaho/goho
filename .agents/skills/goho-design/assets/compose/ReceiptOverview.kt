package com.adamaho.goho.ui.main

import android.text.format.DateFormat
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200ResponseDataInner
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

data class ReceiptOverviewState(
    val uploads: List<ReceiptUploadsList200ResponseDataInner> = emptyList(),
    val receipts: List<Receipt> = emptyList(),
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
    val refreshing: Boolean = false,
    val refreshError: Boolean = false,
)

/**
 * Receipts content below the section title. [thumbnails] outlives section switches so returning to
 * Receipts does not reload photos that already loaded.
 */
@Composable
internal fun ReceiptOverview(
    state: ReceiptOverviewState,
    onRetryClick: () -> Unit,
    onReceiptClick: (String) -> Unit,
    thumbnails: ThumbnailCache,
    modifier: Modifier = Modifier,
    menuOpen: Boolean = false,
    previewTime: Instant? = null,
    deleteReceipt: suspend (ReceiptListEntry) -> Boolean = { false },
    onRefresh: () -> Unit = onRetryClick,
    uploadToReveal: String? = null,
    onUploadRevealed: () -> Unit = {},
) {
    val clock by rememberClock(previewTime)
    val config = LocalConfiguration.current
    val locale = config.locales[0]
    val zone = ZoneId.systemDefault()
    val entries =
        remember(state.receipts, state.uploads, zone) {
            receiptListEntries(state.receipts, state.uploads, zone)
        }
    val pages = rememberFilterPagerState()
    val allListState = rememberLazyListState()
    val attentionListState = rememberLazyListState()
    val uploadedEntryVisible =
        uploadToReveal != null && entries.any { it.key == "upload:$uploadToReveal" }
    LaunchedEffect(uploadToReveal, uploadedEntryVisible) {
        if (uploadToReveal == null) return@LaunchedEffect
        // Reset on return, then again when the uploaded row arrives: stable item keys
        // otherwise preserve the old first visible receipt as rows are inserted above it.
        pages.select(0, animate = false)
        allListState.scrollToItem(0)
        if (uploadedEntryVisible) onUploadRevealed()
    }
    var optionsEntry by remember { mutableStateOf<ReceiptListEntry?>(null) }
    FilterPager(
        state = pages,
        total = entries.size,
        attention = entries.count { it.status == ReceiptListStatus.NotProcessed },
        showFilters = !state.error && state.hasLoaded,
        swipeEnabled =
            state.hasLoaded &&
                !state.error &&
                !state.refreshing &&
                optionsEntry == null &&
                !menuOpen,
        error = state.error,
        refreshing = state.refreshing,
        refreshFailed = state.refreshError || state.error,
        refreshEnabled = !menuOpen && !state.loading && (state.hasLoaded || state.error),
        onRefresh = onRefresh,
        refreshLabel = stringResource(R.string.receipts_refresh),
        refreshProgressLabel = stringResource(R.string.receipts_refreshing),
        modifier = modifier,
    ) { attentionOnly, error, animateEntrance, pageModifier ->
        ReceiptListPage(
            state = state,
            entries = entries,
            attentionOnly = attentionOnly,
            error = error,
            animateEntrance = animateEntrance,
            clock = clock,
            locale = locale,
            zone = zone,
            listState = if (attentionOnly) attentionListState else allListState,
            onRetryClick = onRetryClick,
            onRefresh = onRefresh,
            onReceiptClick = onReceiptClick,
            onOptions = { optionsEntry = it },
            thumbnails = thumbnails,
            modifier = pageModifier,
        )
    }
    optionsEntry?.let { entry ->
        key(entry.key) {
            ReceiptOptions(
                entry,
                locale,
                clock,
                zone,
                thumbnail = { ReceiptThumbnail(entry.receiptId, entry.status, thumbnails) },
                onDelete = { deleteReceipt(entry) },
                onDismiss = { optionsEntry = null },
            )
        }
    }
}

/**
 * One page of day groups, each a heading and its own card. Only the visible headings and rows
 * compose, each row its own lazy item drawn as a [ListCardSegment] of its group's card; a removed
 * row fades out and can't be opened while the rows below slide up, and a group's heading fades with
 * its last row.
 */
@Composable
private fun ReceiptListPage(
    state: ReceiptOverviewState,
    entries: List<ReceiptListEntry>,
    attentionOnly: Boolean,
    error: Boolean,
    animateEntrance: Boolean,
    clock: Instant,
    locale: Locale,
    zone: ZoneId,
    listState: LazyListState,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    onReceiptClick: (String) -> Unit,
    onOptions: (ReceiptListEntry) -> Unit,
    thumbnails: ThumbnailCache,
    modifier: Modifier = Modifier,
) {
    val config = LocalConfiguration.current
    val expanded = config.fontScale >= 1.3f || config.screenWidthDp < GohoSpacing.compactWidth.value
    val today = clock.atZone(zone).toLocalDate()
    val filtered = remember(entries, attentionOnly) { filterReceiptEntries(entries, attentionOnly) }
    val sections =
        remember(filtered, today, locale) { receiptListSections(filtered, today, locale) }
    val reduced = rememberReducedMotion()
    // Rows check the current entries, so a row fading out can't be opened again.
    val current by rememberUpdatedState(filtered)
    val c = GohoTheme.colors
    val showLoading = rememberLoadingVisible(state.loading)
    val showStatus = error || (state.hasLoaded && rememberEmptyShown(filtered.isEmpty()))
    Column(modifier.fillMaxSize()) {
        if (showStatus) {
            BoxWithConstraints(
                Modifier.weight(1f).fillMaxWidth().padding(bottom = GohoSpacing.listBottom)
            ) {
                Column(
                    Modifier.fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = maxHeight)
                        .padding(
                            horizontal = GohoSpacing.screenMargin,
                            vertical = GohoSpacing.screenMargin,
                        ),
                    verticalArrangement = Arrangement.Center,
                ) {
                    when {
                        error ->
                            LoadErrorState(
                                description = stringResource(R.string.receipts_load_failed_body),
                                onRetry = { if (state.error && !state.loading) onRetryClick() },
                                isRetrying = state.loading || !state.error,
                                showProgress = state.error && showLoading && !state.refreshing,
                            )
                        attentionOnly -> NoNeedsAttentionState(animateEntrance = animateEntrance)
                        else -> NoReceiptsState(animateEntrance = animateEntrance)
                    }
                }
            }
        } else
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
                if (!state.hasLoaded && state.loading)
                    item("loading", contentType = "loading") {
                        SkeletonScope(loading = true) {
                            Column(
                                Modifier.loadingSemantics(
                                    true,
                                    stringResource(R.string.receipts_loading),
                                )
                            ) {
                                ReceiptSectionHeading("")
                                ListCard {
                                    repeat(4) { index ->
                                        if (index > 0) ListDivider()
                                        ReceiptRow(
                                            null,
                                            clock,
                                            locale,
                                            zone,
                                            expanded,
                                            onReceiptClick,
                                            onOptions,
                                            thumbnails,
                                        )
                                    }
                                }
                            }
                        }
                    }
                sections.forEach { section ->
                    item("section:${section.group}", contentType = "heading") {
                        ReceiptSectionHeading(
                            sectionTitle(section.group, locale, today.year),
                            Modifier.listRowMotion(this, reduced),
                        )
                    }
                    itemsIndexed(
                        section.entries,
                        key = { _, entry -> entry.key },
                        contentType = { _, _ -> "receipt" },
                    ) { index, entry ->
                        ListCardSegment(
                            first = index == 0,
                            last = index == section.entries.lastIndex,
                            modifier = Modifier.listRowMotion(this, reduced),
                        ) {
                            if (index > 0) ListDivider()
                            ReceiptRow(
                                entry,
                                clock,
                                locale,
                                zone,
                                expanded,
                                onReceiptClick,
                                onOptions,
                                thumbnails,
                                leaving = { current.none { it.key == entry.key } },
                            )
                        }
                    }
                }
            }
    }
}

@Composable
private fun ReceiptSectionHeading(title: String, modifier: Modifier = Modifier) {
    Text(
        title,
        style = GohoTheme.type.section,
        color = GohoTheme.colors.textTertiary,
        modifier =
            modifier
                .padding(
                    start = GohoSpacing.textInsetFromMargin,
                    top = GohoSpacing.sectionTop,
                    bottom = GohoSpacing.sectionLabelBottom,
                )
                .skeleton(GohoSpacing.skeletonWidth)
                .semantics { heading() },
    )
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
private fun ReceiptRow(
    entry: ReceiptListEntry?,
    now: Instant,
    locale: Locale,
    zone: ZoneId,
    expanded: Boolean,
    onReceiptClick: (String) -> Unit,
    onReceiptOptions: (ReceiptListEntry) -> Unit,
    thumbnails: ThumbnailCache,
    leaving: () -> Boolean = { false },
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    var held by remember { mutableStateOf(false) }
    LaunchedEffect(pressed) {
        held = false
        if (pressed) {
            delay(GohoMotion.HOLD_DELAY_MILLIS)
            held = true
        }
    }
    val optionsLabel =
        stringResource(
            if (entry?.receiptId == null) R.string.scan_options else R.string.receipt_options
        )
    val clickable =
        if (entry != null && entry.status != ReceiptListStatus.Processing)
            Modifier.combinedClickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = {
                    if (!leaving()) entry.receiptId?.let(onReceiptClick) ?: onReceiptOptions(entry)
                },
                onLongClickLabel = optionsLabel,
                // combinedClickable supplies exactly one platform long-press haptic.
                onLongClick = {
                    held = false
                    if (!leaving()) onReceiptOptions(entry)
                },
            )
        else Modifier
    ReceiptSummary(
        entry = entry,
        now = now,
        locale = locale,
        zone = zone,
        expanded = expanded,
        thumbnail = {
            ReceiptThumbnail(
                entry?.receiptId,
                entry?.status ?: ReceiptListStatus.Processed,
                thumbnails,
            )
        },
        modifier =
            Modifier.fillMaxWidth()
                .then(clickable)
                .listRowPressFeedback(interaction, held)
                .heightIn(min = GohoSpacing.rowMinHeight)
                .semantics(mergeDescendants = true) {}
                .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.rowVertical),
    )
}
