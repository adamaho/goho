package com.adamaho.goho.ui.main

import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import kotlinx.coroutines.delay

/**
 * The saved books among [entries] whose title or author contains the search [key], in list order
 * (A–Z), or null for an empty key, which filters nothing. Filtering uses the loaded books, with no
 * request per keystroke.
 */
@Composable
internal fun rememberBookMatches(entries: List<BookListEntry>, key: String): List<BookListEntry>? {
    val keyed =
        remember(entries) {
            entries.filterIsInstance<BookListEntry.Saved>().map {
                Triple(it, bookSearchKey(it.book.title), bookSearchKey(it.book.author.orEmpty()))
            }
        }
    return remember(keyed, key) {
        if (key.isEmpty()) null
        else keyed.filter { (_, title, author) -> key in title || key in author }.map { it.first }
    }
}

/** The visible match count above the filtered rows; [SearchAnnouncement] reads it out. */
@Composable
internal fun BookSearchCount(count: String, modifier: Modifier = Modifier) {
    Text(
        count,
        style = GohoTheme.type.section,
        color = GohoTheme.colors.textTertiary,
        modifier =
            modifier
                .padding(
                    start = GohoSpacing.textInsetFromMargin,
                    bottom = GohoSpacing.searchCountBottom,
                )
                .clearAndSetSemantics {},
    )
}

@Composable
internal fun noMatchesTitle(search: SectionSearch): String =
    stringResource(
        R.string.books_search_empty_title,
        search.query.text.toString().trim { it.code.isSearchSpace() },
    )

/**
 * No saved book matches the [search] query: the magnifying-glass Bram with Clear search, top
 * aligned so it clears the keyboard. It enters once, not on every keystroke.
 */
@Composable
internal fun NoBookMatches(search: SectionSearch) {
    val keyboard = LocalSoftwareKeyboardController.current
    val scroll = rememberScrollState()
    DismissKeyboardOnDrag(scroll.interactionSource)
    Column(Modifier.fillMaxSize().verticalScroll(scroll).padding(GohoSpacing.screenMargin)) {
        StatusContent(
            illustration = R.drawable.status_no_search_results,
            title = noMatchesTitle(search),
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
}

/**
 * The polite announcement of the count or no-matches [text], over the count line's place, once
 * typing in [search] pauses; every edit restarts the wait, even when the text stays the same, and
 * an empty [text] clears it at once. It's drawn transparent rather than faded or zero-sized, since
 * accessibility skips nodes with zero alpha or no size. It wraps its text, with a hairline minimum
 * while empty, so it covers little of the row beneath.
 */
@Composable
internal fun BoxScope.SearchAnnouncement(text: String, search: SectionSearch) {
    val query = search.query.text.toString()
    var announced by remember { mutableStateOf("") }
    LaunchedEffect(text, query) {
        if (text.isNotEmpty()) delay(GohoMotion.SEARCH_ANNOUNCE_DELAY_MILLIS)
        announced = text
    }
    Text(
        announced,
        style = GohoTheme.type.section,
        color = Color.Transparent,
        modifier =
            Modifier.align(Alignment.TopStart)
                .padding(start = GohoSpacing.textInset, top = GohoSpacing.headerFadeHeight)
                .widthIn(min = GohoSpacing.hairline)
                .clearAndSetSemantics {
                    liveRegion = LiveRegionMode.Polite
                    contentDescription = announced
                },
    )
}

/**
 * Dragging a scroll with these [interactions] hides the keyboard and returns the field to rest.
 * Scrolls that bring a focused row into view aren't drags, so keyboard focus can move down the
 * results.
 */
@Composable
internal fun DismissKeyboardOnDrag(interactions: InteractionSource) {
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
