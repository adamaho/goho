package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.semantics.semantics
import com.adamaho.goho.theme.GohoShapes
import com.adamaho.goho.theme.GohoSpacing
import com.adamaho.goho.theme.GohoTheme
import com.adamaho.goho.theme.TagColor
import com.adamaho.goho.theme.TagPalette

/** Display-only tag with a required icon and a visible, wrapping label. */
@Composable
fun Tag(
    label: String,
    icon: Painter,
    color: TagColor,
    modifier: Modifier = Modifier,
    shimmer: Boolean = false,
) {
    TagSurface(color, modifier.semantics(mergeDescendants = true) {}) { palette ->
        Row(
            Modifier.heightIn(min = GohoSpacing.tagHeight)
                .padding(
                    horizontal = GohoSpacing.tagHorizontal,
                    vertical = GohoSpacing.tagVertical,
                ),
            horizontalArrangement = Arrangement.spacedBy(GohoSpacing.tagIconGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                painter = icon,
                contentDescription = null,
                tint = palette.content,
                modifier = Modifier.size(GohoSpacing.tagIcon),
            )
            CenteredPillLabel(
                text = label,
                style =
                    if (shimmer)
                        GohoTheme.type.label.copy(
                            brush =
                                shimmerBrush(
                                    palette.content,
                                    lerp(palette.content, palette.container, 0.04f),
                                )
                        )
                    else GohoTheme.type.label,
                color = if (shimmer) Color.Unspecified else palette.content,
                maxLines = Int.MAX_VALUE,
            )
        }
    }
}

/** Fixed-size icon-only tag; the description carries the meaning without a visible label. */
@Composable
fun Tag(
    icon: Painter,
    color: TagColor,
    contentDescription: String,
    modifier: Modifier = Modifier,
) {
    TagSurface(color, modifier.size(GohoSpacing.categoryIcon)) { palette ->
        Icon(
            painter = icon,
            contentDescription = contentDescription,
            tint = palette.content,
            modifier = Modifier.size(GohoSpacing.tagIcon),
        )
    }
}

@Composable
private fun TagSurface(
    color: TagColor,
    modifier: Modifier,
    content: @Composable (TagPalette) -> Unit,
) {
    val palette = color.palette(GohoTheme.colors.isDark)
    Box(
        modifier.background(palette.container, GohoShapes.tag),
        contentAlignment = Alignment.Center,
    ) {
        content(palette)
    }
}
