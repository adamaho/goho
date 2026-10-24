package com.adamaho.goho.ui.main

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
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
 * shows All at the top until that accepted scan, or the book it saved, is listed.
 */
@Composable
internal fun BookOverview(
    state: BookListState,
    covers: ThumbnailCache,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    onBookClick: (Book) -> Unit,
    deleteBook: suspend (Book) -> Boolean,
    modifier: Modifier = Modifier,
    menuOpen: Boolean = false,
    uploadToReveal: UUID? = null,
    onUploadRevealed: () -> Unit = {},
) {
    val clock by rememberClock()
    val zone = ZoneId.systemDefault()
    val locale = LocalConfiguration.current.locales[0]
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
            !menuOpen && optionsBook == null && !state.loading && (state.hasLoaded || state.error),
        onRefresh = onRefresh,
        refreshLabel = stringResource(R.string.books_refresh),
        refreshProgressLabel = stringResource(R.string.books_refreshing),
        modifier = modifier,
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
            now = clock,
            zone = zone,
            locale = locale,
            listState = if (attentionOnly) attentionListState else allListState,
            onRetryClick = onRetryClick,
            onRefresh = onRefresh,
            covers = covers,
            onBookClick = onBookClick,
            onBookOptions = { optionsBook = it },
            optionsBookId = optionsBook?.id,
            modifier = pageModifier,
        )
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

@Composable
private fun BookListPage(
    state: BookListState,
    entries: List<BookListEntry>,
    attentionOnly: Boolean,
    error: Boolean,
    animateEntrance: Boolean,
    now: Instant,
    zone: ZoneId,
    locale: Locale,
    listState: LazyListState,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    covers: ThumbnailCache,
    onBookClick: (Book) -> Unit,
    onBookOptions: (Book) -> Unit,
    optionsBookId: String?,
    modifier: Modifier = Modifier,
) {
    val config = LocalConfiguration.current
    val expanded = config.fontScale >= 1.3f || config.screenWidthDp < GohoSpacing.compactWidth.value
    val showLoading = rememberLoadingVisible(state.loading)
    val reduced = rememberReducedMotion()
    val removalDuration = if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS
    val removal =
        fadeOut(tween(removalDuration)) +
            shrinkVertically(tween(removalDuration), shrinkTowards = Alignment.Top)
    // Keep removed rows mounted in their place for their exit within this page.
    var retained by remember(attentionOnly) { mutableStateOf(entries) }
    val visibleKeys = entries.map { it.key }.toSet()
    val displayed = withRemovedEntries(entries, retained)
    LaunchedEffect(entries) {
        if (retained.any { it.key !in visibleKeys } && !reduced)
            delay(GohoMotion.SHEET_CONTENT_MILLIS.toLong())
        retained = entries
    }
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
                                    BookRow(null, now, zone, locale, expanded, covers)
                                }
                            }
                        }
                    }
                if (displayed.isNotEmpty())
                    item("books") {
                        AnimatedVisibility(
                            entries.isNotEmpty(),
                            enter = EnterTransition.None,
                            exit = removal,
                        ) {
                            ListCard {
                                displayed.forEachIndexed { index, entry ->
                                    key(entry.key) {
                                        val visible = entry.key in visibleKeys
                                        AnimatedVisibility(
                                            visible,
                                            enter = EnterTransition.None,
                                            exit = removal,
                                        ) {
                                            Column {
                                                BookRow(
                                                    entry,
                                                    now,
                                                    zone,
                                                    locale,
                                                    expanded,
                                                    covers,
                                                    // A row folding away can't reopen its book.
                                                    onClick = if (visible) onBookClick else null,
                                                    onOptions =
                                                        if (visible) onBookOptions else null,
                                                    optionsOpen =
                                                        entry is BookListEntry.Saved &&
                                                            entry.book.id == optionsBookId,
                                                )
                                                if (
                                                    displayed.drop(index + 1).any {
                                                        it.key in visibleKeys
                                                    }
                                                )
                                                    ListDivider(GohoSpacing.bookDividerStart)
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
