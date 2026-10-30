package com.adamaho.goho.ui.main

import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.delay

/**
 * Books row around [BookSummary]. Saved books open the book overlay through [onClick] and, on a
 * hold, their options sheet through [onOptions]; failed scans open their options on a tap or hold,
 * and queued or processing scans are display-only. A null [entry] keeps the same layout for
 * skeleton loading. [optionsOpen] marks the row whose options sheet is open.
 */
@Composable
internal fun BookRow(
    entry: BookListEntry?,
    now: Instant,
    zone: ZoneId,
    locale: Locale,
    expanded: Boolean,
    covers: ThumbnailCache,
    onClick: ((Book) -> Unit)? = null,
    onOptions: ((BookListEntry) -> Unit)? = null,
    optionsOpen: Boolean = false,
) {
    val book = (entry as? BookListEntry.Saved)?.book
    val failedScan = entry?.needsAttention == true
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    var held by remember { mutableStateOf(false) }
    LaunchedEffect(pressed) {
        held = false
        if (pressed) {
            delay(GohoMotion.HOLD_DELAY_MILLIS)
            held = true
        }
    }
    // Focus returns to the row when its book overlay or options sheet closes, unless it's leaving.
    val focus = remember { FocusRequester() }
    val selected =
        optionsOpen || (book != null && LocalBookOverlay.current?.isLifted(book.id) == true)
    var wasSelected by remember { mutableStateOf(false) }
    LaunchedEffect(selected) {
        if (wasSelected && !selected && (onClick != null || onOptions != null)) focus.requestFocus()
        wasSelected = selected
    }
    val optionsLabel =
        stringResource(if (failedScan) R.string.book_scan_options else R.string.book_options)
    val open: (() -> Unit)? =
        when {
            book != null -> onClick?.let { { it(book) } }
            entry != null && failedScan -> onOptions?.let { { it(entry) } }
            else -> null
        }
    val clickable =
        if (entry != null && open != null)
            Modifier.focusRequester(focus)
                .combinedClickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClick = open,
                    onLongClickLabel = optionsLabel,
                    // combinedClickable supplies exactly one platform long-press haptic.
                    onLongClick =
                        onOptions?.let { options ->
                            {
                                held = false
                                options(entry)
                            }
                        },
                )
        else Modifier
    BookSummary(
        entry = entry,
        now = now,
        zone = zone,
        locale = locale,
        expanded = expanded,
        covers = covers,
        liftCover = true,
        modifier =
            Modifier.fillMaxWidth()
                .then(clickable)
                .listRowPressFeedback(interaction, held)
                .heightIn(min = GohoSpacing.rowMinHeight)
                .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.rowVertical),
    )
}
