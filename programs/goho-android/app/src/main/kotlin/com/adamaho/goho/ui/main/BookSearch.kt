package com.adamaho.goho.ui.main

import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.text.NumberFormat
import kotlinx.coroutines.delay

/**
 * Saved books whose title or author contains the open [search] query, in list order (A–Z), with
 * their count, or the no-matches state. Typing filters the loaded [saved] books without a request
 * and returns to the top; refreshes and deletions keep the scroll position, and only deleted rows
 * fold out. Dragging hides the keyboard and returns the field to rest, keeping the query.
 */
@Composable
internal fun BookSearchResults(
    search: SectionSearch,
    saved: List<BookListEntry.Saved>,
    rows: BookRowContext,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val query = search.query.text.toString()
    val key = bookSearchKey(query)
    val keyed =
        remember(saved) {
            saved.map {
                Triple(it, bookSearchKey(it.book.title), bookSearchKey(it.book.author.orEmpty()))
            }
        }
    val matches =
        remember(keyed, key) {
            keyed.filter { (_, title, author) -> key in title || key in author }.map { it.first }
        }
    val displayed = rememberRemovingEntries(matches, resetKey = key)
    val noMatches = key.isNotEmpty() && displayed.isEmpty()
    val listState = rememberLazyListState()
    LaunchedEffect(key) { listState.scrollToItem(0) }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    // The keyboard goes away before a book's overlay or options sheet opens over the results.
    val resultRows =
        remember(rows, focusManager) {
            rows.copy(
                onBookClick = {
                    focusManager.clearFocus()
                    rows.onBookClick(it)
                },
                onBookOptions = {
                    focusManager.clearFocus()
                    rows.onBookOptions(it)
                },
            )
        }
    DismissKeyboardOnDrag(listState.interactionSource)
    val count =
        pluralStringResource(
            R.plurals.books_count,
            matches.size,
            NumberFormat.getIntegerInstance(rows.locale).format(matches.size),
        )
    val noMatchesTitle =
        stringResource(R.string.books_search_empty_title, query.trim { it.code.isSearchSpace() })
    // The count shows at once; it's announced once typing pauses, replacing any pending one. Every
    // edit restarts the wait, even when the count stays the same.
    val announcement = if (noMatches) noMatchesTitle else count
    var announced by remember { mutableStateOf("") }
    LaunchedEffect(announcement, query) {
        delay(GohoMotion.SEARCH_ANNOUNCE_DELAY_MILLIS)
        announced = announcement
    }
    Box(modifier.fillMaxSize().imePadding()) {
        if (noMatches) {
            val scroll = rememberScrollState()
            DismissKeyboardOnDrag(scroll.interactionSource)
            // Top-aligned so it clears the keyboard; it enters once, not on every keystroke.
            Column(
                Modifier.fillMaxSize().verticalScroll(scroll).padding(GohoSpacing.screenMargin)
            ) {
                StatusContent(
                    illustration = R.drawable.status_no_search_results,
                    title = noMatchesTitle,
                    description = stringResource(R.string.books_search_empty_body),
                ) {
                    ActionButton(
                        stringResource(R.string.search_clear),
                        { search.clear(keyboard) },
                        variant = 2,
                        color = ButtonColor.Grey,
                        size = ButtonSize.Small,
                    )
                }
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().headerFade(c.background),
                contentPadding =
                    PaddingValues(
                        start = GohoSpacing.screenMargin,
                        end = GohoSpacing.screenMargin,
                        bottom = GohoSpacing.screenMargin,
                    ),
            ) {
                item("count") {
                    Text(
                        count,
                        style = GohoTheme.type.section,
                        color = c.textTertiary,
                        modifier =
                            Modifier.padding(
                                    start = GohoSpacing.textInsetFromMargin,
                                    top = GohoSpacing.searchCountTop,
                                    bottom = GohoSpacing.searchCountBottom,
                                )
                                .clearAndSetSemantics {},
                    )
                }
                if (displayed.isNotEmpty())
                    item("books") { BookListCard(matches, displayed, resultRows) }
            }
        }
        // The polite announcement, over the count line's place. It's drawn transparent rather than
        // faded or zero-sized, since accessibility skips nodes with zero alpha or no size. It wraps
        // its text, with a hairline minimum while empty, so it covers little of the row beneath.
        Text(
            announced,
            style = GohoTheme.type.section,
            color = Color.Transparent,
            modifier =
                Modifier.align(Alignment.TopStart)
                    .padding(
                        start = GohoSpacing.textInset,
                        top = GohoSpacing.searchCountTop,
                    )
                    .widthIn(min = GohoSpacing.hairline)
                    .clearAndSetSemantics {
                        liveRegion = LiveRegionMode.Polite
                        contentDescription = announced
                    },
        )
    }
}

/**
 * Dragging a scroll with these [interactions] hides the keyboard and returns the field to rest.
 * Scrolls that bring a focused row into view aren't drags, so keyboard focus can move down the
 * results.
 */
@Composable
private fun DismissKeyboardOnDrag(interactions: InteractionSource) {
    val focusManager = LocalFocusManager.current
    LaunchedEffect(interactions, focusManager) {
        interactions.interactions.collect {
            if (it is DragInteraction.Start) focusManager.clearFocus()
        }
    }
}

/**
 * The server's `GET /books?search=` key for [value]: runs of the whitespace its PostgreSQL locale
 * (`en_US.utf8`) matches as `[[:space:]]` collapse to one space, the ends are trimmed, and each
 * code point is lowercased on its own, as SQL `lower()` does. A query matches a title or author
 * whose key contains its key. No-break spaces stay distinct from spaces, as on the server.
 */
internal fun bookSearchKey(value: String): String = buildString {
    var space = false
    var offset = 0
    while (offset < value.length) {
        val point = value.codePointAt(offset)
        offset += Character.charCount(point)
        if (point.isSearchSpace()) space = isNotEmpty()
        else {
            if (space) append(' ')
            space = false
            appendCodePoint(Character.toLowerCase(point))
        }
    }
}

private fun Int.isSearchSpace() =
    this in 0x09..0x0D ||
        this == 0x20 ||
        this == 0x85 ||
        this in 0x2000..0x2006 ||
        this in 0x2008..0x200A ||
        this == 0x2028 ||
        this == 0x2029 ||
        this == 0x205F ||
        this == 0x3000
