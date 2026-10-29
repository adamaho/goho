package com.adamaho.goho.ui.main

import android.text.format.DateFormat
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
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
import java.util.UUID
import kotlinx.coroutines.delay

data class ReceiptOverviewState(
    val uploads: List<ReceiptUploadsList200ResponseDataInner> = emptyList(),
    val receipts: List<Receipt> = emptyList(),
    /** This device's receipt scans that the server hasn't accepted yet. */
    val localUploads: List<LocalUpload> = emptyList(),
    /** Row keys that accepted uploads keep from their local rows. */
    val uploadKeys: Map<UUID, String> = emptyMap(),
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
    val refreshing: Boolean = false,
    val refreshError: Boolean = false,
)

/**
 * Receipts content below the section title. [thumbnails] outlives section switches so returning to
 * Receipts does not reload photos that already loaded. [uploadToReveal] is the key of a new row to
 * show at the top of All.
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
    retryUpload: (ReceiptListEntry) -> Unit = {},
    onRefresh: () -> Unit = onRetryClick,
    uploadToReveal: String? = null,
    onUploadRevealed: () -> Unit = {},
) {
    val clock by rememberClock(previewTime)
    val config = LocalConfiguration.current
    val locale = config.locales[0]
    val zone = ZoneId.systemDefault()
    val entries =
        remember(state.receipts, state.uploads, state.localUploads, state.uploadKeys, zone) {
            receiptListEntries(
                state.receipts,
                state.uploads,
                zone,
                state.localUploads,
                state.uploadKeys,
            )
        }
    val pages = rememberFilterPagerState()
    val allListState = rememberLazyListState()
    val attentionListState = rememberLazyListState()
    val uploadedEntryVisible = uploadToReveal != null && entries.any { it.key == uploadToReveal }
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
        attention = entries.count { it.needsAttention },
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
                onRetry = { retryUpload(entry) },
            )
        }
    }
}

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
    val today = clock.atZone(zone).toLocalDate()
    val filtered = remember(entries, attentionOnly) { filterReceiptEntries(entries, attentionOnly) }
    val reduced = rememberReducedMotion()
    val removalDuration = if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS
    val removal =
        fadeOut(tween(removalDuration)) +
            shrinkVertically(tween(removalDuration), shrinkTowards = Alignment.Top)
    // Keep removed rows mounted for their exit within this page.
    var retained by remember(attentionOnly) { mutableStateOf(filtered) }
    val visibleKeys = filtered.map { it.key }.toSet()
    val displayed =
        (filtered + retained.filter { it.key !in visibleKeys }).sortedWith(
            compareByDescending<ReceiptListEntry> { it.date }.thenByDescending { it.uploadedAt }
        )
    LaunchedEffect(filtered) {
        if (retained.any { it.key !in visibleKeys } && !reduced)
            delay(GohoMotion.SHEET_CONTENT_MILLIS.toLong())
        retained = filtered
    }
    val sections = receiptListSections(displayed, today, locale)
    val c = GohoTheme.colors
    val showLoading = rememberLoadingVisible(state.loading)
    val hasLocalUploads = filtered.any { it.localId != null }
    val showStatus =
        (error && !hasLocalUploads) ||
            (state.hasLoaded && filtered.isEmpty() && displayed.isEmpty())
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
                if (!state.hasLoaded && state.loading && !hasLocalUploads)
                    item("loading") {
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
                                            config.fontScale >= 1.3f ||
                                                config.screenWidthDp <
                                                    GohoSpacing.compactWidth.value,
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
                    item("section:${section.group}") {
                        AnimatedVisibility(
                            section.entries.any { it.key in visibleKeys },
                            enter = EnterTransition.None,
                            exit = removal,
                        ) {
                            Column {
                                ReceiptSectionHeading(
                                    sectionTitle(section.group, locale, today.year)
                                )
                                ListCard {
                                    section.entries.forEachIndexed { index, entry ->
                                        key(entry.key) {
                                            AnimatedVisibility(
                                                entry.key in visibleKeys,
                                                enter = EnterTransition.None,
                                                exit = removal,
                                            ) {
                                                Column {
                                                    ReceiptRow(
                                                        entry,
                                                        clock,
                                                        locale,
                                                        zone,
                                                        config.fontScale >= 1.3f ||
                                                            config.screenWidthDp <
                                                                GohoSpacing.compactWidth.value,
                                                        onReceiptClick,
                                                        onOptions,
                                                        thumbnails,
                                                    )
                                                    if (
                                                        section.entries.drop(index + 1).any {
                                                            it.key in visibleKeys
                                                        }
                                                    )
                                                        ListDivider()
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
    }
}

@Composable
private fun ReceiptSectionHeading(title: String) {
    Text(
        title,
        style = GohoTheme.type.section,
        color = GohoTheme.colors.textTertiary,
        modifier =
            Modifier.padding(
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
    val optionsLabel = stringResource(R.string.receipt_options)
    val clickable =
        if (
            entry != null &&
                entry.status != ReceiptListStatus.Processing &&
                entry.status != ReceiptListStatus.Uploading
        )
            Modifier.combinedClickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = { entry.receiptId?.let(onReceiptClick) ?: onReceiptOptions(entry) },
                onLongClickLabel = optionsLabel,
                // combinedClickable supplies exactly one platform long-press haptic.
                onLongClick = {
                    held = false
                    onReceiptOptions(entry)
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
