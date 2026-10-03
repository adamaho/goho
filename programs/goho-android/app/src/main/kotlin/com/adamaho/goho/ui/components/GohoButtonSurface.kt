package com.adamaho.goho.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.unit.DpOffset
import com.adamaho.goho.theme.GohoColors
import com.adamaho.goho.theme.GohoSpacing

/** Shared flat fill and inset rings; only the wide shadow fades away while pressed. */
internal fun Modifier.gohoButtonSurface(
    colors: GohoColors,
    shape: RoundedCornerShape,
    progress: Float,
    primary: Boolean = true,
    destructive: Boolean = false,
): Modifier {
    val p = progress.coerceIn(0f, 1f)
    val filled = primary || destructive
    val fill =
        when {
            destructive -> lerp(colors.danger, colors.dangerPressed, p)
            primary -> lerp(colors.accent, colors.accentPressed, p)
            else -> lerp(colors.buttonSecondary, colors.buttonSecondaryPressed, p)
        }
    val ring =
        when {
            destructive -> colors.dangerRing
            primary -> colors.accentRing
            else -> colors.secondaryRing
        }
    val innerRing =
        when {
            destructive -> colors.dangerInnerRing
            primary -> colors.buttonInnerRing
            else -> Color.Transparent
        }
    val shadowColor =
        when {
            destructive -> colors.dangerShadow
            primary -> colors.accentShadow
            else -> colors.shadow
        }
    val nearAlpha = if (filled) colors.buttonShadowAlpha else colors.secondaryShadowAlpha
    val wideAlpha = if (filled) colors.buttonWideShadowAlpha else colors.secondaryWideShadowAlpha
    return this.dropShadow(
            shape,
            Shadow(
                radius = GohoSpacing.buttonWideShadowRadius,
                spread =
                    if (filled) GohoSpacing.buttonWideShadowSpread
                    else GohoSpacing.secondaryWideShadowSpread,
                offset = DpOffset(GohoSpacing.flatElevation, GohoSpacing.buttonWideShadowY),
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
                alpha = nearAlpha,
            ),
        )
        .clip(shape)
        .background(fill)
        .border(GohoSpacing.hairline, ring, shape)
        .drawWithContent {
            drawContent()
            if (innerRing.alpha > 0f) {
                val inset = GohoSpacing.buttonRingInset.toPx()
                val radius = (shape.topStart.toPx(size, this) - inset).coerceAtLeast(0f)
                drawRoundRect(
                    color = innerRing,
                    topLeft = Offset(inset, inset),
                    size =
                        Size(
                            (size.width - 2 * inset).coerceAtLeast(0f),
                            (size.height - 2 * inset).coerceAtLeast(0f),
                        ),
                    cornerRadius = CornerRadius(radius),
                    style = Stroke(GohoSpacing.hairline.toPx()),
                )
            }
        }
}
