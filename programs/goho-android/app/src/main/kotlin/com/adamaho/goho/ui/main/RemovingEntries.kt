package com.adamaho.goho.ui.main

import androidx.compose.runtime.*
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import kotlinx.coroutines.delay

/**
 * [entries] plus the rows removed since the last change, kept in place while they fold out, for the
 * Books and Recipes cards. Changing [resetKey], such as the filter or a search query, drops them at
 * once instead, as does a removed row that doesn't [fold], such as a link being added that its
 * import replaces.
 */
@Composable
internal fun <T> rememberRemovingEntries(
    entries: List<T>,
    key: (T) -> String,
    resetKey: Any?,
    fold: (T) -> Boolean = { true },
): List<T> {
    val reduced = rememberReducedMotion()
    var retained by remember(resetKey) { mutableStateOf(entries) }
    LaunchedEffect(entries) {
        val keys = entries.mapTo(HashSet(), key)
        if (retained.any { key(it) !in keys && fold(it) } && !reduced)
            delay(GohoMotion.SHEET_CONTENT_MILLIS.toLong())
        retained = entries
    }
    return withRemovedEntries(entries, retained, key, fold)
}

/** [current] with the folding rows removed since [previous] kept after the row they followed. */
private fun <T> withRemovedEntries(
    current: List<T>,
    previous: List<T>,
    key: (T) -> String,
    fold: (T) -> Boolean,
): List<T> {
    val keys = current.mapTo(HashSet(), key)
    if (previous.all { key(it) in keys || !fold(it) }) return current
    val result = current.toMutableList()
    var insertAt = 0
    previous.forEach { entry ->
        if (key(entry) in keys) insertAt = result.indexOfFirst { key(it) == key(entry) } + 1
        else if (fold(entry)) result.add(insertAt++, entry)
    }
    return result
}
