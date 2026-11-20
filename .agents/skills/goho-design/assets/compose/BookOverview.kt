package com.adamaho.goho.ui.main

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.api.generated.model.BookUpload
import com.adamaho.goho.api.generated.model.BookUploadStatus
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import java.util.UUID

data class BookListState(
    val books: List<Book> = emptyList(),
    val uploads: List<BookUpload> = emptyList(),
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
    val refreshing: Boolean = false,
    val refreshError: Boolean = false,
)

/**
 * Books content below the section title. Saved rows open the book overlay on tap and their options
 * sheet on a hold, and failed scans open theirs on a tap or hold; [deleteEntry] returns whether the
 * deletion of the held book or scan was accepted, and [addAuthor] saves the author typed for a held
 * book without one. [uploadToReveal] shows All at the top until that accepted scan, or the book it
 * saved, is listed. While [search] is open its results replace the pages, which keep their filter
 * and scroll positions for its exit.
 */
@Composable
internal fun BookOverview(
    state: BookListState,
    covers: ThumbnailCache,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    onBookClick: (Book) -> Unit,
    deleteEntry: suspend (BookListEntry) -> Boolean,
    addAuthor: (bookId: String, author: String) -> Unit,
    search: SectionSearch,
    modifier: Modifier = Modifier,
    menuOpen: Boolean = false,
    uploadToReveal: UUID? = null,
    onUploadRevealed: () -> Unit = {},
) {
    val clock by rememberClock()
    val zone = ZoneId.systemDefault()
    val locale = LocalConfiguration.current.locales[0]
    val reduced = rememberReducedMotion()
    val entries =
        remember(state.books, state.uploads, locale) {
            bookListEntries(state.books, state.uploads, locale)
        }
    val pages = rememberFilterPagerState()
    val allListState = rememberLazyListState()
    val attentionListState = rememberLazyListState()
    // A scan that already succeeded is listed as its book, which may be one saved before.
    val uploadedEntryVisible =
        state.uploads
            .find { it.id == uploadToReveal }
            ?.let { upload ->
                entries.any {
                    when (it) {
                        is BookListEntry.Scan -> it.uploadId == upload.id
                        is BookListEntry.Saved ->
                            upload.status == BookUploadStatus.succeeded &&
                                it.book.id == upload.bookId
                    }
                }
            } ?: false
    LaunchedEffect(uploadToReveal, uploadedEntryVisible) {
        if (uploadToReveal == null) return@LaunchedEffect
        // Reset on return, then again when the scan's row arrives, as on Receipts.
        pages.select(0, animate = false)
        allListState.scrollToItem(0)
        if (uploadedEntryVisible) onUploadRevealed()
    }
    // The held row's snapshot, so refreshes and its own deletion never change the open sheet.
    var optionsEntry by remember { mutableStateOf<BookListEntry?>(null) }
    val overlay = LocalBookOverlay.current
    // The open overlay and options sheet handle Back first, including while they delete.
    BackHandler(enabled = search.open && overlay?.open != true) { search.close() }
    val config = LocalConfiguration.current
    val expanded = config.fontScale >= 1.3f || config.screenWidthDp < GohoSpacing.compactWidth.value
    val optionsKey = optionsEntry?.key
    val rows =
        remember(clock, zone, locale, expanded, covers, onBookClick, optionsKey) {
            BookRowContext(
                now = clock,
                zone = zone,
                locale = locale,
                expanded = expanded,
                covers = covers,
                onBookClick = onBookClick,
                onBookOptions = { optionsEntry = it },
                optionsKey = optionsKey,
            )
        }
    val saved = remember(entries) { entries.filterIsInstance<BookListEntry.Saved>() }
    val contentShift = with(LocalDensity.current) { GohoMotion.searchContentShift.roundToPx() }
    AnimatedContent(
        search.open,
        modifier = modifier,
        transitionSpec = { searchContentTransform(targetState, contentShift, reduced).using(null) },
        label = "Book search",
    ) { searching ->
        val leaving = searching != search.open
        // Only the incoming rows lift their covers, so no book's cover is shared twice.
        CompositionLocalProvider(LocalBookOverlay provides if (leaving) null else overlay) {
            if (searching)
                BookSearchResults(
                    search = search,
                    saved = saved,
                    rows = rows,
                    modifier = Modifier.leaving(leaving),
                )
            else
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
                    refreshEnabled =
                        !menuOpen &&
                            optionsEntry == null &&
                            !state.loading &&
                            (state.hasLoaded || state.error),
                    onRefresh = onRefresh,
                    refreshLabel = stringResource(R.string.books_refresh),
                    refreshProgressLabel = stringResource(R.string.books_refreshing),
                    modifier = Modifier.leaving(leaving),
                ) { attentionOnly, error, animateEntrance, pageModifier ->
                    BookListPage(
                        state = state,
                        entries =
                            remember(entries, attentionOnly) {
                                if (attentionOnly) entries.filter { it.needsAttention } else entries
                            },
                        attentionOnly = attentionOnly,
                        error = error,
                        animateEntrance = animateEntrance,
                        rows = rows,
                        listState = if (attentionOnly) attentionListState else allListState,
                        onRetryClick = onRetryClick,
                        modifier = pageModifier,
                    )
                }
        }
    }
    optionsEntry?.let { entry ->
        key(entry.key) {
            BookOptions(
                entry,
                clock,
                zone,
                locale,
                covers,
                onDelete = { deleteEntry(entry) },
                onDismiss = { optionsEntry = null },
                onAddAuthor =
                    (entry as? BookListEntry.Saved)
                        ?.book
                        ?.takeIf { it.author == null }
                        ?.let { book -> { author -> addAuthor(book.id, author) } },
            )
        }
    }
}

/** What every Books row shares, on the pages and in the search results. */
internal data class BookRowContext(
    val now: Instant,
    val zone: ZoneId,
    val locale: Locale,
    val expanded: Boolean,
    val covers: ThumbnailCache,
    val onBookClick: (Book) -> Unit,
    val onBookOptions: (BookListEntry) -> Unit,
    val optionsKey: String?,
)

/**
 * One page. Only the visible rows compose, each its own lazy item drawn as a [ListCardSegment] of
 * the one card; a removed row fades out and can't be opened while the rows below slide up, and the
 * empty state waits for the last row to fade.
 */
@Composable
private fun BookListPage(
    state: BookListState,
    entries: List<BookListEntry>,
    attentionOnly: Boolean,
    error: Boolean,
    animateEntrance: Boolean,
    rows: BookRowContext,
    listState: LazyListState,
    onRetryClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val showLoading = rememberLoadingVisible(state.loading)
    val reduced = rememberReducedMotion()
    val empty = rememberEmptyShown(entries.isEmpty())
    // Rows check the current entries, so a row fading out can't reopen its book.
    val current by rememberUpdatedState(entries)
    Column(modifier.fillMaxSize()) {
        if (error || (state.hasLoaded && empty)) {
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
                                description = stringResource(R.string.books_load_failed_body),
                                onRetry = { if (state.error && !state.loading) onRetryClick() },
                                isRetrying = state.loading || !state.error,
                                showProgress = state.error && showLoading && !state.refreshing,
                            )
                        attentionOnly -> NoNeedsAttentionState(animateEntrance = animateEntrance)
                        else -> NoBooksState(animateEntrance = animateEntrance)
                    }
                }
            }
        } else
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().headerFade(GohoTheme.colors.background),
                contentPadding =
                    PaddingValues(
                        start = GohoSpacing.screenMargin,
                        end = GohoSpacing.screenMargin,
                        bottom = GohoSpacing.listBottom,
                    ),
            ) {
                // Books has no section labels, so the card starts below the header fade. The gap
                // is an item, so a row arriving first while the list is at the top shows rather
                // than lands above it.
                item("top", contentType = "top") {
                    Spacer(Modifier.height(GohoSpacing.headerFadeHeight))
                }
                if (!state.hasLoaded && state.loading)
                    item("loading", contentType = "loading") {
                        SkeletonScope(loading = true) {
                            // The card and its dividers wait for the masks, so no empty card shows.
                            ListCard(
                                Modifier.skeletonContainer()
                                    .loadingSemantics(true, stringResource(R.string.books_loading))
                            ) {
                                repeat(4) { index ->
                                    if (index > 0) ListDivider(GohoSpacing.bookDividerStart)
                                    BookRow(
                                        null,
                                        rows.now,
                                        rows.zone,
                                        rows.locale,
                                        rows.expanded,
                                        rows.covers,
                                    )
                                }
                            }
                        }
                    }
                itemsIndexed(
                    entries,
                    key = { _, entry -> entry.key },
                    contentType = { _, _ -> "book" },
                ) { index, entry ->
                    ListCardSegment(
                        first = index == 0,
                        last = index == entries.lastIndex,
                        modifier = Modifier.listRowMotion(this, reduced),
                    ) {
                        if (index > 0) ListDivider(GohoSpacing.bookDividerStart)
                        BookRow(
                            entry,
                            rows.now,
                            rows.zone,
                            rows.locale,
                            rows.expanded,
                            rows.covers,
                            onClick = rows.onBookClick,
                            onOptions = rows.onBookOptions,
                            optionsOpen = entry.key == rows.optionsKey,
                            leaving = { current.none { it.key == entry.key } },
                        )
                    }
                }
            }
    }
}
