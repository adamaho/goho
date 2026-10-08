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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
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
    deleteReceipt: suspend (ReceiptListEntry) -> Boolean = { false },
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
    val reduced = rememberReducedMotion()
    val removalDuration = if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS
    val removal =
        fadeOut(tween(removalDuration)) +
            shrinkVertically(tween(removalDuration), shrinkTowards = Alignment.Top)
    // Keep removed rows mounted for their exit; filters still change immediately.
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
    var optionsEntry by remember { mutableStateOf<ReceiptListEntry?>(null) }
    val currentLoadImage by rememberUpdatedState(loadReceiptImage)
    val thumbnails = remember { ReceiptThumbnails { currentLoadImage(it) } }
    val listState = rememberLazyListState()
    LaunchedEffect(attentionOnly) { listState.scrollToItem(0) }
    val c = GohoTheme.colors
    val showLoading = rememberLoadingVisible(state.loading)
    // Keep the outgoing error's header and content in place while a successful retry fades in.
    val recovery = updateTransition(state.error, label = "Receipt recovery")
    recovery.AnimatedContent(
        modifier = modifier.fillMaxSize().background(c.background).safeDrawingPadding(),
        transitionSpec = {
            if (initialState && !targetState && !reduced)
                (fadeIn(tween(GohoMotion.STATUS_CROSSFADE_MILLIS)) togetherWith
                        fadeOut(tween(GohoMotion.STATUS_CROSSFADE_MILLIS)))
                    .using(null)
            else (EnterTransition.None togetherWith ExitTransition.None).using(null)
        },
    ) { error ->
        val showStatus = error || (state.hasLoaded && filtered.isEmpty() && displayed.isEmpty())
        val showScan = !error
        Box(
            Modifier.fillMaxSize()
                .then(if (error != state.error) Modifier.clearAndSetSemantics {} else Modifier)
        ) {
            Column(Modifier.fillMaxSize()) {
                ReceiptListHeader(
                    entries.size,
                    entries.count { it.status == ReceiptListStatus.NotProcessed },
                    attentionOnly,
                    { attentionOnly = it },
                    locale,
                    showFilters = !error,
                )
                if (showStatus) {
                    BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
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
                            if (!error) {
                                scanError?.let { ListNotice(stringResource(it)) }
                                if (isOpeningScanner)
                                    ListNotice(stringResource(R.string.scan_opening))
                            }
                            when {
                                error ->
                                    ReceiptsConnectionErrorState(
                                        onRetry = {
                                            if (state.error && !state.loading) onRetryClick()
                                        },
                                        isRetrying = state.loading || !state.error,
                                        showProgress = state.error && showLoading,
                                    )
                                attentionOnly ->
                                    NoNeedsAttentionState(animateEntrance = !recovery.currentState)
                                else -> NoReceiptsState(animateEntrance = !recovery.currentState)
                            }
                        }
                    }
                    if (showScan)
                        Box(
                            Modifier.fillMaxWidth()
                                .padding(
                                    start = GohoSpacing.screenMargin,
                                    end = GohoSpacing.screenMargin,
                                    top = GohoSpacing.screenMargin,
                                    bottom = GohoSpacing.fabBottom,
                                ),
                            contentAlignment = Alignment.CenterEnd,
                        ) {
                            ScanButton(!isOpeningScanner, onScanClick)
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
                        scanError?.let { error ->
                            item("scan-error") { ListNotice(stringResource(error)) }
                        }
                        if (isOpeningScanner)
                            item("scanner") { ListNotice(stringResource(R.string.scan_opening)) }
                        if (!state.hasLoaded && showLoading)
                            item("loading") {
                                Box(
                                    Modifier.fillMaxWidth()
                                        .padding(vertical = GohoSpacing.contentGap),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    GohoLoadingIcon(
                                        description = stringResource(R.string.receipts_loading)
                                    )
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
                                                                        GohoSpacing.compactWidth
                                                                            .value,
                                                                onReceiptClick,
                                                                { optionsEntry = it },
                                                                thumbnails,
                                                            )
                                                            if (
                                                                section.entries
                                                                    .drop(index + 1)
                                                                    .any { it.key in visibleKeys }
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
            if (showScan && !showStatus)
                ScanButton(
                    !isOpeningScanner,
                    onScanClick,
                    Modifier.align(Alignment.BottomEnd)
                        .padding(end = GohoSpacing.screenMargin, bottom = GohoSpacing.fabBottom),
                )
        }
    }
    optionsEntry?.let { entry ->
        key(entry.key) {
            ReceiptOptions(
                entry,
                locale,
                today,
                zone,
                thumbnail = {
                    ReceiptThumbnail(entry.receiptId, entry.status, thumbnails, sheetHeader = true)
                },
                onDelete = { deleteReceipt(entry) },
                onDismiss = { optionsEntry = null },
            )
        }
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
    onReceiptOptions: (ReceiptListEntry) -> Unit,
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
    val justNow =
        entry.status == ReceiptListStatus.Processing &&
            entry.uploadedAt != null &&
            entry.uploadedAt <= now &&
            now.epochSecond - entry.uploadedAt.epochSecond < 60
    val justNowLabel = stringResource(R.string.date_just_now)
    val metadata = buildAnnotatedString {
        if (
            entry.uploadedAt != null &&
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
        if (entry.status != ReceiptListStatus.Processing)
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
    Row(
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
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.thumbToText),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ReceiptThumbnail(entry.receiptId, entry.status, thumbnails)
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
            receiptMoneyText(
                receiptAmount(entry.total, locale),
                entry.currency,
                locale,
                showCurrencyCode = true,
            ),
            style = GohoTheme.type.rowTitle,
            color = if (entry.total == null) c.textTertiary else c.textPrimary,
        )
    }
}
