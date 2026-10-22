package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.adamaho.goho.theme.*

// Reference only (not compiled). Approved October 22, 2026; not implemented.
// Behaviour: references/screens.md section 9 (Generated cover) and components.md BookCover.

/** Cloth, spine and text colours for a book without a cover image, from its category TagColor. */
internal data class ClothColors(val cloth: Color, val spine: Color, val text: Color)

internal fun TagColor.cloth(dark: Boolean): ClothColors {
    val light = palette(dark = false)
    val night = palette(dark = true)
    val cloth = if (dark) lerp(night.container, night.content, 0.24f) else light.content
    return ClothColors(
        cloth = cloth,
        spine = lerp(cloth, Color.Black, 0.28f),
        // Same hue, contrasting: at least 5.2:1 on the cloth for every TagColor.
        text = if (dark) lerp(night.content, Color.White, 0.4f) else light.container,
    )
}

/** Full-size generated cover (200×292dp) for the book overlay. Decorative. */
@Composable
internal fun GeneratedBookCover(title: String, author: String, color: TagColor, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val cloth = color.cloth(c.isDark)
    val shape = GohoShapes.cover
    Box(
        modifier
            .size(200.dp, 292.dp)
            .clip(shape)
            .background(cloth.cloth)
            .border(1.dp, if (c.isDark) Color.White.copy(alpha = 0.06f) else c.outline, shape)
            .clearAndSetSemantics {}
    ) {
        Spine(cloth, width = 14.dp, highlight = 2.dp)
        Text(
            title,
            style = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.01).em),
            color = cloth.text,
            maxLines = 5,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 34.dp, end = 20.dp, top = 26.dp),
        )
        Text(
            author,
            style = TextStyle(fontSize = 16.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
            color = cloth.text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(androidx.compose.ui.Alignment.BottomStart).padding(start = 34.dp, end = 20.dp, bottom = 20.dp),
        )
    }
}

/** 40×56dp list version: cloth, 3dp spine, and bars standing in for the title and author. */
@Composable
internal fun GeneratedBookThumb(color: TagColor, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val cloth = color.cloth(c.isDark)
    Box(modifier.size(GohoSpacing.thumbWidth, GohoSpacing.coverHeight).clip(GohoShapes.thumb).background(cloth.cloth)) {
        Box(Modifier.fillMaxHeight().width(3.dp).background(cloth.spine))
        Bar(cloth.text, start = 8.dp, top = 8.dp, end = 6.dp)
        Bar(cloth.text, start = 8.dp, top = 14.dp, end = 12.dp)
        Box(
            Modifier.align(androidx.compose.ui.Alignment.BottomStart)
                .padding(start = 8.dp, bottom = 7.dp)
                .size(14.dp, 2.dp)
                .background(cloth.text.copy(alpha = 0.85f), GohoShapes.pill)
        )
    }
}

@Composable
private fun BoxScope.Spine(cloth: ClothColors, width: Dp, highlight: Dp) {
    Row(Modifier.fillMaxHeight()) {
        Box(Modifier.fillMaxHeight().width(width).background(cloth.spine))
        Box(Modifier.fillMaxHeight().width(highlight).background(Color.White.copy(alpha = if (GohoTheme.colors.isDark) 0.10f else 0.22f)))
    }
}

@Composable
private fun Bar(color: Color, start: Dp, top: Dp, end: Dp) {
    Box(Modifier.padding(start = start, top = top, end = end).fillMaxWidth().height(3.dp).background(color, GohoShapes.pill))
}
