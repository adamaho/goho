package com.adamaho.goho.ui.main

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.api.generated.model.BookUpload
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.delay

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
 * sheet on a hold; [deleteBook] returns whether the server deleted the held book. [uploadToReveal]
 * shows All at the top until that accepted scan, or the book it saved, is listed. While [search] is
 * open its results replace the pages, which keep their filter and scroll positions for its exit.
 */
@Composable
internal fun BookOverview(
    state: BookListState,
    covers: ThumbnailCache,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    onBookClick: (Book) -> Unit,
    deleteBook: suspend (Book) -> Boolean,
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
                            upload.status == BookUpload.Status.succeeded &&
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
    // The held book's snapshot, so refreshes and its own deletion never change the open sheet.
    var optionsBook by remember { mutableStateOf<Book?>(null) }
    val overlay = LocalBookOverlay.current
    // The open overlay and options sheet handle Back first, including while they delete.
    BackHandler(enabled = search.open && overlay?.open != true) { search.close() }
    val config = LocalConfiguration.current
    val expanded = config.fontScale >= 1.3f || config.screenWidthDp < GohoSpacing.compactWidth.value
    val optionsBookId = optionsBook?.id
    val rows =
        remember(clock, zone, locale, expanded, covers, onBookClick, optionsBookId) {
            BookRowContext(
                now = clock,
                zone = zone,
                locale = locale,
                expanded = expanded,
                covers = covers,
                onBookClick = onBookClick,
                onBookOptions = { optionsBook = it },
                optionsBookId = optionsBookId,
            )
        }
    val saved = remember(entries) { entries.filterIsInstance<BookListEntry.Saved>() }
    val fade =
        tween<Float>(if (reduced) 0 else GohoMotion.SEARCH_MILLIS, easing = FastOutSlowInEasing)
    AnimatedContent(
        search.open,
        modifier = modifier,
        transitionSpec = { (fadeIn(fade) togetherWith fadeOut(fade)).using(null) },
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
                            optionsBook == null &&
                            !menuOpen,
                    error = state.error,
                    refreshing = state.refreshing,
                    refreshFailed = state.refreshError || state.error,
                    refreshEnabled =
                        !menuOpen &&
                            optionsBook == null &&
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
    optionsBook?.let { book ->
        key(book.id) {
            BookOptions(
                book,
                clock,
                zone,
                locale,
                covers,
                onDelete = { deleteBook(book) },
                onDismiss = { optionsBook = null },
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
    val onBookOptions: (Book) -> Unit,
    val optionsBookId: String?,
)

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
    val displayed = rememberRemovingEntries(entries, resetKey = attentionOnly)
    Column(modifier.fillMaxSize()) {
        if (error || (state.hasLoaded && displayed.isEmpty())) {
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
                // Books has no section labels, so start the card below the header fade.
                contentPadding =
                    PaddingValues(
                        start = GohoSpacing.screenMargin,
                        top = GohoSpacing.headerFadeHeight,
                        end = GohoSpacing.screenMargin,
                        bottom = GohoSpacing.listBottom,
                    ),
            ) {
                if (!state.hasLoaded && state.loading)
                    item("loading") {
                        SkeletonScope(loading = true) {
                            ListCard(
                                Modifier.loadingSemantics(
                                    true,
                                    stringResource(R.string.books_loading),
                                )
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
                if (displayed.isNotEmpty()) item("books") { BookListCard(entries, displayed, rows) }
            }
    }
}

/**
 * [entries] plus the rows removed since the last change, kept in place while they fold out.
 * Changing [resetKey], such as the filter or a search query, drops them at once instead.
 */
@Composable
internal fun rememberRemovingEntries(
    entries: List<BookListEntry>,
    resetKey: Any?,
): List<BookListEntry> {
    val reduced = rememberReducedMotion()
    var retained by remember(resetKey) { mutableStateOf(entries) }
    LaunchedEffect(entries) {
        val keys = entries.mapTo(HashSet()) { it.key }
        if (retained.any { it.key !in keys } && !reduced)
            delay(GohoMotion.SHEET_CONTENT_MILLIS.toLong())
        retained = entries
    }
    return withRemovedEntries(entries, retained)
}

/**
 * One card of [displayed] rows: those no longer in [entries] fold out and can't be opened, and the
 * card itself folds away with its last row.
 */
@Composable
internal fun BookListCard(
    entries: List<BookListEntry>,
    displayed: List<BookListEntry>,
    rows: BookRowContext,
) {
    val reduced = rememberReducedMotion()
    val removalDuration = if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS
    val removal =
        fadeOut(tween(removalDuration)) +
            shrinkVertically(tween(removalDuration), shrinkTowards = Alignment.Top)
    val visibleKeys = entries.mapTo(HashSet()) { it.key }
    AnimatedVisibility(entries.isNotEmpty(), enter = EnterTransition.None, exit = removal) {
        ListCard {
            displayed.forEachIndexed { index, entry ->
                key(entry.key) {
                    val visible = entry.key in visibleKeys
                    AnimatedVisibility(visible, enter = EnterTransition.None, exit = removal) {
                        Column {
                            BookRow(
                                entry,
                                rows.now,
                                rows.zone,
                                rows.locale,
                                rows.expanded,
                                rows.covers,
                                // A row folding away can't reopen its book.
                                onClick = if (visible) rows.onBookClick else null,
                                onOptions = if (visible) rows.onBookOptions else null,
                                optionsOpen =
                                    entry is BookListEntry.Saved &&
                                        entry.book.id == rows.optionsBookId,
                            )
                            if (displayed.drop(index + 1).any { it.key in visibleKeys })
                                ListDivider(GohoSpacing.bookDividerStart)
                        }
                    }
                }
            }
        }
    }
}

/** [current] with the rows removed since [previous] kept after the row they followed. */
private fun withRemovedEntries(
    current: List<BookListEntry>,
    previous: List<BookListEntry>,
): List<BookListEntry> {
    val keys = current.mapTo(HashSet()) { it.key }
    if (previous.all { it.key in keys }) return current
    val result = current.toMutableList()
    var insertAt = 0
    previous.forEach { entry ->
        if (entry.key in keys) insertAt = result.indexOfFirst { it.key == entry.key } + 1
        else result.add(insertAt++, entry)
    }
    return result
}
