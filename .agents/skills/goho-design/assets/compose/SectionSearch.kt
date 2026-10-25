package com.adamaho.goho.ui.main

import androidx.annotation.StringRes
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.clearText
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.SoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.LayoutDirection
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*

/**
 * A section's search, shared by the header that edits it and the content that shows its results:
 * whether it is open, its [query] and the [focus] of its field. [label] names the search button and
 * [placeholder] fills the empty field.
 */
@Stable
class SectionSearch(
    @StringRes val label: Int,
    @StringRes val placeholder: Int,
    open: Boolean = false,
    val query: TextFieldState = TextFieldState(),
) {
    var open by mutableStateOf(open)
        private set

    val focus = FocusRequester()

    /** Each search starts empty; closing keeps the query so outgoing results don't change. */
    fun open() {
        query.clearText()
        open = true
    }

    fun close() {
        open = false
    }

    /**
     * Empties the query and returns to the field with the [keyboard] up, for its clear control and
     * Clear search. The field can keep focus after Back hides the keyboard, so showing it is
     * explicit.
     */
    fun clear(keyboard: SoftwareKeyboardController?) {
        query.clearText()
        focus.requestFocus()
        keyboard?.show()
    }
}

/** Keeps a [SectionSearch] and its query with the screen's other saveable state. */
@Composable
fun rememberSectionSearch(@StringRes label: Int, @StringRes placeholder: Int): SectionSearch =
    rememberSaveable(
        saver =
            listSaver(
                save = { listOf(it.open, it.query.text.toString()) },
                restore = {
                    SectionSearch(
                        label,
                        placeholder,
                        it[0] as Boolean,
                        TextFieldState(it[1] as String),
                    )
                },
            )
    ) {
        SectionSearch(label, placeholder)
    }

/** Close search and the field in place of the title row; entering focuses the field. */
@Composable
internal fun SearchHeader(search: SectionSearch, modifier: Modifier) {
    LaunchedEffect(Unit) { search.focus.requestFocus() }
    val keyboard = LocalSoftwareKeyboardController.current
    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = GohoSpacing.screenMargin)
            .padding(top = GohoSpacing.headerTop),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(stringResource(R.string.search_close), search::close) { BackChevron() }
        SearchField(
            state = search.query,
            placeholder = stringResource(search.placeholder),
            clearLabel = stringResource(R.string.search_clear),
            onClear = { search.clear(keyboard) },
            focusRequester = search.focus,
            modifier = Modifier.weight(1f).padding(start = GohoSpacing.searchCloseGap),
        )
    }
}

@Composable
private fun BackChevron() {
    val tint = LocalContentColor.current
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    Canvas(Modifier.size(GohoSpacing.detailBackIcon)) {
        fun point(x: Float, y: Float) =
            Offset(size.width * (if (rtl) 1f - x else x), size.height * y)
        val stroke = GohoSpacing.iconStroke.toPx()
        drawLine(tint, point(0.62f, 0.2f), point(0.32f, 0.5f), stroke, StrokeCap.Round)
        drawLine(tint, point(0.32f, 0.5f), point(0.62f, 0.8f), stroke, StrokeCap.Round)
    }
}

/**
 * Shared-axis motion between the title row and the search header. Opening, the title row leaves
 * toward the start as the search header arrives from the end; closing reverses it. [shift] is the
 * distance in pixels, positive toward the end in the current layout direction.
 */
internal fun searchHeaderTransform(
    opening: Boolean,
    shift: Int,
    reduced: Boolean,
): ContentTransform {
    if (reduced) return EnterTransition.None togetherWith ExitTransition.None
    val toward = if (opening) -shift else shift
    val delay =
        if (opening) GohoMotion.SEARCH_HEADER_OPEN_DELAY_MILLIS
        else GohoMotion.SEARCH_HEADER_CLOSE_DELAY_MILLIS
    val duration =
        if (opening) GohoMotion.SEARCH_HEADER_OPEN_MILLIS else GohoMotion.SEARCH_HEADER_CLOSE_MILLIS
    val exit = GohoMotion.SEARCH_EXIT_MILLIS
    return (fadeIn(tween(duration, delay, GohoMotion.emphasizedDecelerate)) +
        slideInHorizontally(tween(duration, delay, GohoMotion.emphasizedDecelerate)) {
            -toward
        }) togetherWith
        (fadeOut(tween(exit, easing = GohoMotion.emphasizedAccelerate)) +
            slideOutHorizontally(tween<IntOffset>(exit, easing = GohoMotion.emphasizedAccelerate)) {
                toward
            })
}

/**
 * The content beneath the header crossfades between the filter pages and the results, both drifting
 * [shift] pixels the same way (up while opening, down while closing) so rows stay roughly in
 * register instead of jumping.
 */
internal fun searchContentTransform(
    opening: Boolean,
    shift: Int,
    reduced: Boolean,
): ContentTransform {
    if (reduced) return EnterTransition.None togetherWith ExitTransition.None
    val toward = if (opening) -shift else shift
    val exit =
        if (opening) GohoMotion.SEARCH_CONTENT_OPEN_EXIT_MILLIS else GohoMotion.SEARCH_EXIT_MILLIS
    val exitEasing = if (opening) GohoMotion.standard else GohoMotion.emphasizedAccelerate
    val enter = GohoMotion.SEARCH_CONTENT_ENTER_MILLIS
    val delay = GohoMotion.SEARCH_CONTENT_ENTER_DELAY_MILLIS
    return (fadeIn(tween(enter, delay, GohoMotion.emphasizedDecelerate)) +
        slideInVertically(tween(enter, delay, GohoMotion.emphasizedDecelerate)) {
            -toward
        }) togetherWith
        (fadeOut(tween(exit, easing = exitEasing)) +
            slideOutVertically(tween<IntOffset>(exit, easing = exitEasing)) { toward })
}
