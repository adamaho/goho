package com.adamaho.goho.ui.main

import androidx.compose.animation.core.tween
import androidx.compose.foundation.lazy.LazyItemScope
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import kotlinx.coroutines.delay

/**
 * A lazy list [item]'s motion, for the Books, Recipes and Receipts lists and book search: a removed
 * row fades out while the rows below slide up, and moved rows slide, over
 * [GohoMotion.SHEET_CONTENT_MILLIS]. New rows appear in place, or [fadeIn], as rows a search filter
 * brings back do. A row that doesn't [fade], such as a link its import replaces, leaves at once;
 * [reduced] motion snaps everything.
 */
internal fun Modifier.listRowMotion(
    item: LazyItemScope,
    reduced: Boolean,
    fade: Boolean = true,
    fadeIn: Boolean = false,
): Modifier =
    with(item) {
        this@listRowMotion.animateItem(
            fadeInSpec = if (reduced || !fadeIn) null else tween(GohoMotion.SHEET_CONTENT_MILLIS),
            placementSpec = if (reduced) null else tween(GohoMotion.SHEET_CONTENT_MILLIS),
            fadeOutSpec = if (reduced || !fade) null else tween(GohoMotion.SHEET_CONTENT_MILLIS),
        )
    }

/**
 * Whether a list's empty state can replace it: at once when it starts [empty] or after [resetKey]
 * changes, otherwise once its last rows have faded out ([listRowMotion]).
 */
@Composable
internal fun rememberEmptyShown(empty: Boolean, resetKey: Any? = Unit): Boolean {
    val reduced = rememberReducedMotion()
    var shown by remember(resetKey) { mutableStateOf(empty) }
    LaunchedEffect(resetKey, empty) {
        if (empty && !shown && !reduced) delay(GohoMotion.SHEET_CONTENT_MILLIS.toLong())
        shown = empty
    }
    return empty && shown
}
