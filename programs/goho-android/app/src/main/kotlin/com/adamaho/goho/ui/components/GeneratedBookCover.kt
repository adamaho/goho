package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import com.adamaho.goho.api.generated.model.Book
import com.adamaho.goho.theme.*

internal enum class BookCoverSize {
    /** 48×56dp list cover with bars standing in for the title and author. */
    Small,
    /** 200×292dp book overlay cover with the title and author printed on it, plus its shadow. */
    Large,
}

/**
 * A clothbound cover in the book's category colour, for books without a cover image or whose image
 * fails to load. Decorative: the row or overlay text announces the book.
 */
@Composable
internal fun GeneratedBookCover(book: Book, size: BookCoverSize, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val cloth = book.category.tagColor.cloth(c.isDark)
    val large = size == BookCoverSize.Large
    val shape = if (large) GohoShapes.cover else GohoShapes.thumb
    Box(
        modifier
            .clearAndSetSemantics {}
            .then(if (large) Modifier.bookCoverShadow(c, shape) else Modifier)
            .size(
                if (large) GohoSpacing.generatedCoverWidth else GohoSpacing.coverWidth,
                if (large) GohoSpacing.bookCoverHeight else GohoSpacing.coverHeight,
            )
            .clip(shape)
            .background(cloth.cloth)
            .border(GohoSpacing.hairline, c.outline, shape)
    ) {
        if (large) LargeCover(book, cloth) else SmallCover(cloth)
    }
}

/** The overlay cover shadow, shared by photo and generated covers. */
internal fun Modifier.bookCoverShadow(colors: GohoColors, shape: RoundedCornerShape) =
    dropShadow(
        shape,
        Shadow(
            radius = GohoSpacing.bookCoverShadowRadius,
            spread = GohoSpacing.bookCoverShadowSpread,
            offset = DpOffset(x = 0.dp, y = GohoSpacing.bookCoverShadowY),
            color = colors.shadow,
            alpha = colors.bookCoverShadowAlpha,
        ),
    )

@Composable
private fun LargeCover(book: Book, cloth: ClothColors) {
    Row(Modifier.fillMaxHeight()) {
        Box(Modifier.fillMaxHeight().width(GohoSpacing.generatedCoverSpine).background(cloth.spine))
        Box(
            Modifier.fillMaxHeight()
                .width(GohoSpacing.generatedCoverHighlight)
                .background(cloth.highlight)
        )
    }
    Column(
        Modifier.fillMaxSize()
            .padding(
                start = GohoSpacing.generatedCoverStart,
                top = GohoSpacing.generatedCoverTop,
                end = GohoSpacing.generatedCoverEnd,
                bottom = GohoSpacing.generatedCoverBottom,
            ),
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        // The title gives way to the author at large font scales.
        Text(
            book.title,
            modifier = Modifier.weight(1f, fill = false),
            style = GohoTheme.type.bookCoverTitle,
            color = cloth.text,
            maxLines = 5,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            book.author,
            style = GohoTheme.type.bookCoverAuthor,
            color = cloth.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun BoxScope.SmallCover(cloth: ClothColors) {
    Box(Modifier.fillMaxHeight().width(GohoSpacing.coverSpine).background(cloth.spine))
    CoverBar(cloth.text, GohoSpacing.coverTitleBarTop, GohoSpacing.coverTitleBarEnd)
    CoverBar(cloth.text, GohoSpacing.coverSubtitleBarTop, GohoSpacing.coverSubtitleBarEnd)
    Box(
        Modifier.align(Alignment.BottomStart)
            .padding(start = GohoSpacing.coverBarStart, bottom = GohoSpacing.coverAuthorBarBottom)
            .size(GohoSpacing.coverAuthorBarWidth, GohoSpacing.coverAuthorBarHeight)
            .background(cloth.text.copy(alpha = AUTHOR_BAR_ALPHA), GohoShapes.pill)
    )
}

@Composable
private fun CoverBar(color: Color, top: Dp, end: Dp) {
    Box(
        Modifier.padding(start = GohoSpacing.coverBarStart, top = top, end = end)
            .fillMaxWidth()
            .height(GohoSpacing.coverBarHeight)
            .background(color, GohoShapes.pill)
    )
}

private data class ClothColors(
    val cloth: Color,
    val spine: Color,
    val highlight: Color,
    val text: Color,
)

// Colour formula from the design (tokens.md "Book overlay"); text is at least 5.2:1 on the cloth.
private const val DARK_CLOTH_MIX = 0.24f
private const val SPINE_MIX = 0.28f
private const val DARK_TEXT_MIX = 0.4f
private const val LIGHT_HIGHLIGHT_ALPHA = 0.22f
private const val DARK_HIGHLIGHT_ALPHA = 0.1f
private const val AUTHOR_BAR_ALPHA = 0.85f

private fun TagColor.cloth(dark: Boolean): ClothColors {
    val palette = palette(dark)
    val cloth =
        if (dark) lerp(palette.container, palette.content, DARK_CLOTH_MIX) else palette.content
    return ClothColors(
        cloth = cloth,
        spine = lerp(cloth, Color.Black, SPINE_MIX),
        highlight =
            Color.White.copy(alpha = if (dark) DARK_HIGHLIGHT_ALPHA else LIGHT_HIGHLIGHT_ALPHA),
        text = if (dark) lerp(palette.content, Color.White, DARK_TEXT_MIX) else palette.container,
    )
}
