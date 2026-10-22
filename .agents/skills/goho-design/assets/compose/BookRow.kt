package com.adamaho.goho.ui.main

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Books row. Saved books open the book overlay through [onClick]; scans are display-only. A null
 * [entry] keeps the same layout for skeleton loading. [expanded] moves the tag below the text for
 * large fonts and narrow screens; titles always stay on one line.
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
) {
    val c = GohoTheme.colors
    val book = (entry as? BookListEntry.Saved)?.book
    val interaction = remember { MutableInteractionSource() }
    val press by pressProgress(interaction)
    // Focus returns to the row when its book overlay closes.
    val focus = remember { FocusRequester() }
    val lifted = book != null && LocalBookOverlay.current?.isLifted(book.id) == true
    var wasLifted by remember { mutableStateOf(false) }
    LaunchedEffect(lifted) {
        if (wasLifted && !lifted) focus.requestFocus()
        wasLifted = lifted
    }
    val clickable =
        if (book != null && onClick != null)
            Modifier.focusRequester(focus)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClick = { onClick(book) },
                )
        else Modifier
    val title =
        when (entry) {
            null -> ""
            is BookListEntry.Saved -> entry.book.title
            is BookListEntry.Scan ->
                stringResource(if (entry.failed) R.string.book_unknown else R.string.book_new)
        }
    Row(
        Modifier.fillMaxWidth()
            .then(clickable)
            // Rows fill edge to edge inside the card, so the shared press darkens the fill only.
            .drawBehind { drawRect(lerp(c.surface, c.surfacePressed, press.coerceIn(0f, 1f))) }
            .heightIn(min = GohoSpacing.rowMinHeight)
            .semantics(mergeDescendants = true) {}
            .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.rowVertical),
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.thumbToText),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BookCover(entry, covers)
        Column(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(GohoSpacing.lineGap),
        ) {
            Text(
                title,
                modifier = Modifier.fillMaxWidth().skeleton(fraction = 0.8f),
                style = GohoTheme.type.rowTitle,
                color = if (entry is BookListEntry.Saved) c.textPrimary else c.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            BookMetadata(entry, now, zone, locale, expanded)
            if (expanded) BookTag(entry, Modifier.align(Alignment.End))
        }
        if (!expanded) BookTag(entry, Modifier.widthIn(max = GohoSpacing.tagMaxWidth))
    }
}

@Composable
private fun BookMetadata(
    entry: BookListEntry?,
    now: Instant,
    zone: ZoneId,
    locale: Locale,
    expanded: Boolean,
) {
    val c = GohoTheme.colors
    val style = GohoTheme.type.meta
    if (entry is BookListEntry.Scan && !entry.failed) {
        // A scan has no author yet: keep one metadata line with a shimmering placeholder.
        Box(contentAlignment = Alignment.CenterStart) {
            Text("", style = style, modifier = Modifier.clearAndSetSemantics {})
            Box(
                Modifier.fillMaxWidth(0.55f)
                    .height(GohoSpacing.skeletonHeight)
                    .clip(GohoShapes.pill)
                    .background(shimmerBrush(c.skeletonBase, c.skeletonShimmer))
            )
        }
        return
    }
    val text =
        when (entry) {
            null -> AnnotatedString("")
            is BookListEntry.Saved ->
                AnnotatedString(
                    entry.book.readingLevel?.let {
                        stringResource(R.string.book_author_level, entry.book.author, it)
                    } ?: entry.book.author
                )
            is BookListEntry.Scan -> uploadTime(entry.uploadedAt, now, zone, locale)
        }
    Text(
        text,
        modifier = Modifier.fillMaxWidth().skeleton(fraction = 0.55f),
        style = style,
        color = c.textTertiary,
        maxLines = if (expanded) Int.MAX_VALUE else 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** Matches receipt rows: "Today, 8:14 AM" for today's scans, otherwise a relative date. */
@Composable
private fun uploadTime(
    uploadedAt: Instant?,
    now: Instant,
    zone: ZoneId,
    locale: Locale,
): AnnotatedString {
    val today = now.atZone(zone).toLocalDate()
    val uploaded = uploadedAt?.atZone(zone)
    val date =
        if (uploaded == null) stringResource(R.string.date_unknown)
        else relativeDate(uploaded.toLocalDate(), today, locale)
    val timestamp = GohoTheme.type.timestamp.toSpanStyle()
    return buildAnnotatedString {
        if (uploaded?.toLocalDate() == today) {
            append("$date, ")
            withStyle(timestamp) {
                append(
                    uploaded.format(
                        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale)
                    )
                )
            }
        } else append(date)
    }
}

@Composable
private fun BookTag(entry: BookListEntry?, modifier: Modifier = Modifier) {
    when (entry) {
        null ->
            Tag(
                label = "",
                icon = painterResource(R.drawable.ic_tag_other),
                color = TagColor.Grey,
                modifier = modifier.skeleton(GohoSpacing.skeletonWidth, block = true),
            )
        is BookListEntry.Saved -> CategoryTag(entry.book.category, modifier)
        is BookListEntry.Scan -> BookUploadTag(processing = !entry.failed, modifier)
    }
}

/**
 * Loads a saved cover once visible. Saved books without one, or whose cover fails to load, show the
 * small generated cover; scans in progress show a lavender scan mark, and failed scans an orange
 * book with an attention dot. Decorative: the row text and tag describe the state.
 */
@Composable
private fun BookCover(entry: BookListEntry?, covers: ThumbnailCache) {
    val book = (entry as? BookListEntry.Saved)?.book
    val bookId = book?.takeIf { it.hasImage }?.id
    var visible by remember { mutableStateOf(false) }
    // A cover still loading keeps the neutral placeholder rather than flashing the generated one.
    var loading by remember(bookId) { mutableStateOf(bookId != null) }
    val bitmap by
        produceState<Bitmap?>(null, bookId, visible, covers) {
            // Keep a loaded cover while off screen so it doesn't flash the generated one on return.
            if (bookId == null) value = null
            else if (visible) value = covers.get(bookId).also { loading = false }
        }
    val image = bitmap
    @Composable
    fun Cover(modifier: Modifier) {
        when {
            image != null ->
                Image(
                    image.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier =
                        modifier
                            .fillMaxSize()
                            .clip(GohoShapes.thumb)
                            .border(
                                GohoSpacing.hairline,
                                GohoTheme.colors.outline,
                                GohoShapes.thumb,
                            ),
                )
            book != null && !loading -> GeneratedBookCover(book, BookCoverSize.Small, modifier)
            else -> CoverPlaceholder(entry, modifier)
        }
    }
    // The slot keeps its size while a lifted cover is away in the book overlay.
    Box(
        Modifier.onGloballyPositioned { visible = !it.boundsInWindow().isEmpty }
            .size(GohoSpacing.thumbWidth, GohoSpacing.coverHeight)
            .clip(GohoShapes.thumb)
            .skeleton(block = true)
    ) {
        if (book != null)
            LiftableBookCover(book.id, onScreen = visible, photo = image != null) { Cover(it) }
        else Cover(Modifier)
    }
}

@Composable
private fun CoverPlaceholder(entry: BookListEntry?, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val shape = GohoShapes.thumb
    val processing = entry is BookListEntry.Scan && !entry.failed
    val failed = entry?.needsAttention == true
    Box(
        modifier
            .fillMaxSize()
            .clip(shape)
            .background(
                when {
                    processing -> c.accentContainer
                    failed -> c.attentionContainer
                    else -> c.surfaceMuted
                }
            )
            .border(GohoSpacing.hairline, c.outline, shape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painterResource(
                if (processing) R.drawable.ic_tag_processing else R.drawable.ic_add_book
            ),
            contentDescription = null,
            tint =
                when {
                    processing -> c.onAccentContainer
                    failed -> c.attention
                    else -> c.textSecondary
                },
            modifier = Modifier.size(GohoSpacing.coverIcon),
        )
        if (failed)
            Box(
                Modifier.align(Alignment.BottomEnd)
                    .padding(GohoSpacing.coverDotInset)
                    .size(GohoSpacing.coverDot)
                    .background(c.attention, GohoShapes.pill)
            )
    }
}
