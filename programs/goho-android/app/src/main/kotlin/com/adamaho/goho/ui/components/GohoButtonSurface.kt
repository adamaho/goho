package com.adamaho.goho.ui.components

import androidx.annotation.IntRange
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.unit.DpOffset
import com.adamaho.goho.theme.GohoColors
import com.adamaho.goho.theme.GohoSpacing

/** Variant 1 is glossy; variant 2 uses the frosted/rimmed finish. Colour is independent. */
internal fun Modifier.gohoButtonSurface(
    colors: GohoColors,
    shape: RoundedCornerShape,
    progress: Float,
    @IntRange(from = 1, to = 2) variant: Int = 1,
    color: GohoButtonColor = GohoButtonColor.Purple,
): Modifier {
    require(variant == 1 || variant == 2) { "Button variant must be 1 or 2" }
    val p = progress.coerceIn(0f, 1f)
    val filled = variant == 1
    val lightFilled = filled && !colors.isDark
    val palette = colors.buttonPalette(color)
    val fill = lerp(palette.fill, palette.pressed, p)
    val ring = if (filled) palette.ring else colors.secondaryRing
    val innerRing = if (filled) palette.innerRing else colors.glassInnerRing
    val shadowColor = palette.shadow
    val nearAlpha = if (filled) colors.buttonShadowAlpha else colors.secondaryShadowAlpha
    val wideAlpha = if (filled) colors.buttonWideShadowAlpha else colors.secondaryWideShadowAlpha
    val shade = if (filled) colors.buttonShade else colors.glassShade
    val darkGlass = !filled && colors.isDark
    val sheen = if (filled) colors.buttonSheen else colors.glassSheen
    val highlight = if (filled) colors.buttonEdgeHighlight else colors.glassEdgeHighlight
    val ringWidth = if (darkGlass) GohoSpacing.darkGlassRingWidth else GohoSpacing.hairline
    val finish =
        Brush.verticalGradient(
            0f to sheen.compositeOver(fill),
            0.45f to fill,
            1f to shade.compositeOver(fill),
        )
    val edge =
        Brush.verticalGradient(
            0f to highlight,
            0.45f to ring,
            1f to ring,
        )
    return this.dropShadow(
            shape,
            Shadow(
                radius =
                    if (lightFilled) GohoSpacing.lightButtonWideShadowRadius
                    else GohoSpacing.buttonWideShadowRadius,
                spread =
                    if (filled) GohoSpacing.buttonWideShadowSpread
                    else GohoSpacing.secondaryWideShadowSpread,
                offset =
                    DpOffset(
                        GohoSpacing.flatElevation,
                        if (lightFilled) GohoSpacing.lightButtonWideShadowY
                        else GohoSpacing.buttonWideShadowY,
                    ),
                color = shadowColor,
                alpha = wideAlpha * (1f - p),
            ),
        )
        .dropShadow(
            shape,
            Shadow(
                radius = GohoSpacing.buttonShadowRadius,
                offset = DpOffset(GohoSpacing.flatElevation, GohoSpacing.buttonShadowY),
                color = shadowColor,
                alpha = nearAlpha * (1f - p),
            ),
        )
        .clip(shape)
        .background(finish)
        .border(ringWidth, edge, shape)
        .drawWithCache {
            val inset =
                (if (darkGlass) GohoSpacing.darkGlassRingInset else GohoSpacing.buttonRingInset)
                    .toPx()
            val radius = (shape.topStart.toPx(size, this) - inset).coerceAtLeast(0f)
            val insetSize =
                Size(
                    (size.width - 2 * inset).coerceAtLeast(0f),
                    (size.height - 2 * inset).coerceAtLeast(0f),
                )
            val reflection =
                Brush.verticalGradient(
                    0f to innerRing,
                    0.5f to if (darkGlass) innerRing else Color.Transparent,
                    1f to if (darkGlass) innerRing else shade,
                )
            onDrawWithContent {
                drawContent()
                // Keep the bright reflection at the edge, away from labels and icons.
                drawRoundRect(
                    brush = reflection,
                    topLeft = Offset(inset, inset),
                    size = insetSize,
                    cornerRadius = CornerRadius(radius),
                    style = Stroke(GohoSpacing.hairline.toPx()),
                )
            }
        }
}
