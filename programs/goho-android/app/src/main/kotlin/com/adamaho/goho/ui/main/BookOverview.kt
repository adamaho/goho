package com.adamaho.goho.ui.main

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
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

data class BookListState(
    val books: List<Book> = emptyList(),
    val uploads: List<BookUpload> = emptyList(),
    val hasLoaded: Boolean = false,
    val loading: Boolean = false,
    val error: Boolean = false,
    val refreshing: Boolean = false,
    val refreshError: Boolean = false,
)

/** Books content below the section title. Rows are display-only. */
@Composable
internal fun BookOverview(
    state: BookListState,
    covers: ThumbnailCache,
    isOpeningScanner: Boolean,
    @StringRes scanError: Int?,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    menuOpen: Boolean = false,
) {
    val clock by rememberClock()
    val zone = ZoneId.systemDefault()
    val locale = LocalConfiguration.current.locales[0]
    val entries =
        remember(state.books, state.uploads) { bookListEntries(state.books, state.uploads) }
    val pages = rememberFilterPagerState()
    val allListState = rememberLazyListState()
    val attentionListState = rememberLazyListState()
    FilterPager(
        state = pages,
        total = entries.size,
        attention = entries.count { it.needsAttention },
        showFilters = !state.error && state.hasLoaded,
        swipeEnabled = state.hasLoaded && !state.error && !state.refreshing && !menuOpen,
        error = state.error,
        refreshing = state.refreshing,
        refreshFailed = state.refreshError || state.error,
        refreshEnabled = !menuOpen && !state.loading && (state.hasLoaded || state.error),
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
            isOpeningScanner = isOpeningScanner,
            scanError = scanError,
            onRetryClick = onRetryClick,
            onRefresh = onRefresh,
            covers = covers,
            modifier = pageModifier,
        )
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
    isOpeningScanner: Boolean,
    @StringRes scanError: Int?,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    covers: ThumbnailCache,
    modifier: Modifier = Modifier,
) {
    val config = LocalConfiguration.current
    val expanded = config.fontScale >= 1.3f || config.screenWidthDp < GohoSpacing.compactWidth.value
    val showLoading = rememberLoadingVisible(state.loading)
    val refreshFailed = stringResource(R.string.books_refresh_failed)
    val retry = stringResource(R.string.retry)
    Column(modifier.fillMaxSize()) {
        if (error || (state.hasLoaded && entries.isEmpty())) {
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
                    if (state.refreshError) ListNotice(refreshFailed, retry, onRefresh)
                    if (!error) {
                        scanError?.let { ListNotice(stringResource(it)) }
                        if (isOpeningScanner) ListNotice(stringResource(R.string.scan_opening))
                    }
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
                if (state.refreshError)
                    item("refresh-error") { ListNotice(refreshFailed, retry, onRefresh) }
                scanError?.let { error -> item("scan-error") { ListNotice(stringResource(error)) } }
                if (isOpeningScanner)
                    item("scanner") { ListNotice(stringResource(R.string.scan_opening)) }
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
                                    if (index > 0) ListDivider()
                                    BookRow(null, now, zone, locale, expanded, covers)
                                }
                            }
                        }
                    }
                if (entries.isNotEmpty())
                    item("books") {
                        ListCard {
                            entries.forEachIndexed { index, entry ->
                                key(entry.key) {
                                    if (index > 0) ListDivider()
                                    BookRow(entry, now, zone, locale, expanded, covers)
                                }
                            }
                        }
                    }
            }
    }
}
