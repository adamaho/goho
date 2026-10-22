package com.adamaho.goho.ui.main

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Display-only Books row. A null [entry] keeps the same layout for skeleton loading. [expanded]
 * moves the tag below the text for large fonts and narrow screens; titles always stay on one line.
 */
@Composable
internal fun BookRow(
    entry: BookListEntry?,
    now: Instant,
    zone: ZoneId,
    locale: Locale,
    expanded: Boolean,
    covers: ThumbnailCache,
) {
    val c = GohoTheme.colors
    val title =
        when (entry) {
            null -> ""
            is BookListEntry.Saved -> entry.book.title
            is BookListEntry.Scan ->
                stringResource(if (entry.failed) R.string.book_unknown else R.string.book_new)
        }
    Row(
        Modifier.fillMaxWidth()
            .background(c.surface)
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
 * Loads a saved cover once visible. Books without one show a neutral book, scans in progress a
 * lavender scan mark, and failed scans an orange book with an attention dot. Decorative: the row
 * text and tag describe the state.
 */
@Composable
private fun BookCover(entry: BookListEntry?, covers: ThumbnailCache) {
    val c = GohoTheme.colors
    val shape = GohoShapes.thumb
    val bookId = (entry as? BookListEntry.Saved)?.book?.takeIf { it.hasImage }?.id
    var visible by remember { mutableStateOf(false) }
    val bitmap by
        produceState<Bitmap?>(null, bookId, visible, covers) {
            value = if (visible && bookId != null) covers.get(bookId) else null
        }
    val processing = entry is BookListEntry.Scan && !entry.failed
    val failed = entry?.needsAttention == true
    Box(
        Modifier.onGloballyPositioned { visible = !it.boundsInWindow().isEmpty }
            .size(GohoSpacing.thumbWidth, GohoSpacing.coverHeight)
            .clip(shape)
            .skeleton(block = true)
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
        val image = bitmap
        if (image != null)
            Image(
                image.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        else {
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
}
