package com.adamaho.goho.ui.main

import android.text.format.DateFormat
import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
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
import kotlinx.coroutines.launch

data class ReceiptOverviewState(
    val uploads: List<ReceiptUploadsList200ResponseDataInner> = emptyList(),
    val receipts: List<Receipt> = emptyList(),
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
    val refreshing: Boolean = false,
    val refreshError: Boolean = false,
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
    deleteReceipt: suspend (ReceiptListEntry) -> Boolean = { false },
    onRefresh: () -> Unit = onRetryClick,
    uploadToReveal: String? = null,
    onUploadRevealed: () -> Unit = {},
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
    val pagerState = rememberPagerState { 2 }
    val scope = rememberCoroutineScope()
    val reduced = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    var lastHapticPage by remember { mutableIntStateOf(pagerState.settledPage) }
    LaunchedEffect(pagerState.settledPage) {
        if (pagerState.settledPage != lastHapticPage) {
            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
            lastHapticPage = pagerState.settledPage
        }
    }
    val allListState = rememberLazyListState()
    val attentionListState = rememberLazyListState()
    val uploadedEntryVisible =
        uploadToReveal != null && entries.any { it.key == "upload:$uploadToReveal" }
    LaunchedEffect(uploadToReveal, uploadedEntryVisible) {
        if (uploadToReveal == null) return@LaunchedEffect
        // Reset on return, then again when the uploaded row arrives: stable item keys
        // otherwise preserve the old first visible receipt as rows are inserted above it.
        lastHapticPage = 0
        pagerState.scrollToPage(0)
        allListState.scrollToItem(0)
        if (uploadedEntryVisible) onUploadRevealed()
    }
    var optionsEntry by remember { mutableStateOf<ReceiptListEntry?>(null) }
    val currentLoadImage by rememberUpdatedState(loadReceiptImage)
    val thumbnails = remember { ReceiptThumbnails { currentLoadImage(it) } }
    val recovery = updateTransition(state.error, label = "Receipt recovery")
    // This screen has no text input. Ignore an outgoing launcher keyboard's insets so
    // Scan stays anchored to the window during cold start, before the IME finishes hiding.
    Box(
        modifier
            .fillMaxSize()
            .background(GohoTheme.colors.background)
            .windowInsetsPadding(WindowInsets.systemBars.union(WindowInsets.displayCutout))
    ) {
        Column(Modifier.fillMaxSize()) {
            ReceiptListHeader(
                entries.size,
                entries.count { it.status == ReceiptListStatus.NotProcessed },
                pagerState.currentPage == 1,
                { attentionOnly ->
                    val page = if (attentionOnly) 1 else 0
                    // The tab already supplies its own selection haptic.
                    lastHapticPage = page
                    scope.launch {
                        if (reduced) pagerState.scrollToPage(page)
                        else pagerState.animateScrollToPage(page)
                    }
                },
                locale,
                showFilters = !state.error && state.hasLoaded,
            )
            PullToRefresh(
                refreshing = state.refreshing,
                failed = state.refreshError || state.error,
                enabled = !state.loading && (state.hasLoaded || state.error),
                onRefresh = onRefresh,
                modifier = Modifier.weight(1f).fillMaxWidth(),
            ) {
                HorizontalPager(
                    state = pagerState,
                    beyondViewportPageCount = 1,
                    userScrollEnabled =
                        state.hasLoaded &&
                            !state.error &&
                            !state.refreshing &&
                            optionsEntry == null,
                    modifier = Modifier.fillMaxSize(),
                ) { page ->
                    recovery.AnimatedContent(
                        transitionSpec = {
                            if (initialState && !targetState && !reduced)
                                (fadeIn(tween(GohoMotion.STATUS_CROSSFADE_MILLIS)) togetherWith
                                        fadeOut(tween(GohoMotion.STATUS_CROSSFADE_MILLIS)))
                                    .using(null)
                            else (EnterTransition.None togetherWith ExitTransition.None).using(null)
                        }
                    ) { error ->
                        ReceiptListPage(
                            state = state,
                            entries = entries,
                            attentionOnly = page == 1,
                            error = error,
                            animateEntrance = !recovery.currentState,
                            clock = clock,
                            locale = locale,
                            zone = zone,
                            listState = if (page == 0) allListState else attentionListState,
                            isOpeningScanner = isOpeningScanner,
                            scanError = scanError,
                            onRetryClick = onRetryClick,
                            onRefresh = onRefresh,
                            onReceiptClick = onReceiptClick,
                            onOptions = { optionsEntry = it },
                            thumbnails = thumbnails,
                            modifier =
                                if (error != state.error || page != pagerState.currentPage)
                                    Modifier.clearAndSetSemantics {}
                                else Modifier,
                        )
                    }
                }
            }
        }
        // One persistent action belongs to the screen, outside page and recovery transitions.
        ScanButton(
            !isOpeningScanner,
            onScanClick,
            Modifier.align(Alignment.BottomEnd)
                .padding(end = GohoSpacing.fabMarginEnd, bottom = GohoSpacing.fabBottom),
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
    isOpeningScanner: Boolean,
    @StringRes scanError: Int?,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    onReceiptClick: (String) -> Unit,
    onOptions: (ReceiptListEntry) -> Unit,
    thumbnails: ReceiptThumbnails,
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
    val showStatus = error || (state.hasLoaded && filtered.isEmpty() && displayed.isEmpty())
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
                    if (state.refreshError)
                        ListNotice(
                            stringResource(R.string.receipts_refresh_failed),
                            stringResource(R.string.receipts_retry),
                            onRefresh,
                        )
                    if (!error) {
                        scanError?.let { ListNotice(stringResource(it)) }
                        if (isOpeningScanner) ListNotice(stringResource(R.string.scan_opening))
                    }
                    when {
                        error ->
                            ReceiptsConnectionErrorState(
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
                if (state.refreshError)
                    item("refresh-error") {
                        ListNotice(
                            stringResource(R.string.receipts_refresh_failed),
                            stringResource(R.string.receipts_retry),
                            onRefresh,
                        )
                    }
                scanError?.let { error -> item("scan-error") { ListNotice(stringResource(error)) } }
                if (isOpeningScanner)
                    item("scanner") { ListNotice(stringResource(R.string.scan_opening)) }
                if (!state.hasLoaded && state.loading)
                    item("loading") {
                        SkeletonScope(loading = true) {
                            Column(
                                Modifier.loadingSemantics(
                                    true,
                                    stringResource(R.string.receipts_loading),
                                )
                            ) {
                                ReceiptSectionHeading("")
                                ReceiptCard {
                                    repeat(4) { index ->
                                        if (index > 0) ReceiptDivider()
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
                                ReceiptCard {
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
                                                        ReceiptDivider()
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
        if (action != null)
            ActionButton(
                action,
                onAction,
                modifier = Modifier.padding(top = GohoSpacing.contentGap),
                variant = 2,
                color = ButtonColor.Grey,
            )
    }
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
    thumbnails: ReceiptThumbnails,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val reduced = rememberReducedMotion()
    var held by remember { mutableStateOf(false) }
    LaunchedEffect(pressed) {
        held = false
        if (pressed) {
            delay(GohoMotion.HOLD_DELAY_MILLIS)
            held = true
        }
    }
    val scale by
        animateFloatAsState(
            if (held) GohoMotion.HOLD_SCALE else 1f,
            if (reduced) snap() else if (held) GohoMotion.pressIn else GohoMotion.pressOut,
            label = "Receipt hold",
        )
    val optionsLabel = stringResource(R.string.receipt_options)
    val clickable =
        if (entry != null && entry.status != ReceiptListStatus.Processing)
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
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                }
                .background(c.surface)
                .heightIn(min = GohoSpacing.rowMinHeight)
                .semantics(mergeDescendants = true) {}
                .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.rowVertical),
    )
}
