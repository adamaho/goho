// Shared-layout skeleton reference; see references/components.md.
package com.goho.ui.components

import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import com.goho.ui.theme.GohoSpacing
import com.goho.ui.theme.GohoTheme

private data class Skeleton(val visible: Boolean, val brush: Brush)

private val LocalSkeleton = staticCompositionLocalOf<Skeleton?> { null }

/** Shares a single, reduced-motion-aware shimmer across the existing content layout. */
@Composable
internal fun SkeletonScope(loading: Boolean, content: @Composable () -> Unit) {
    val inherited = LocalSkeleton.current
    val delayed = rememberLoadingVisible(loading)
    val visible = delayed || LocalInspectionMode.current
    val colors = GohoTheme.colors
    val skeleton =
        inherited
            ?: if (loading)
                Skeleton(visible, rememberShimmerBrush(colors.skeletonBase, colors.skeletonShimmer))
            else null
    CompositionLocalProvider(LocalSkeleton provides skeleton, content = content)
}

/** Masks an existing element without replacing its layout or exposing placeholder semantics. */
@Composable
internal fun Modifier.skeleton(
    minWidth: Dp = Dp.Unspecified,
    fraction: Float = 1f,
    block: Boolean = false,
    alignEnd: Boolean = false,
): Modifier {
    val skeleton = LocalSkeleton.current ?: return this
    return widthIn(min = minWidth)
        .clearAndSetSemantics {}
        .drawWithContent {
            if (skeleton.visible) {
                val width = size.width * fraction
                val height = if (block) size.height else size.height * 0.6f
                val end = if (layoutDirection == LayoutDirection.Rtl) !alignEnd else alignEnd
                drawRoundRect(
                    brush = skeleton.brush,
                    topLeft =
                        Offset(if (end) size.width - width else 0f, (size.height - height) / 2),
                    size = Size(width, height),
                    cornerRadius = CornerRadius(GohoSpacing.skeletonRadius.toPx()),
                )
            }
        }
}

internal fun Modifier.loadingSemantics(loading: Boolean, description: String): Modifier =
    if (loading)
        clearAndSetSemantics {
            contentDescription = description
            liveRegion = LiveRegionMode.Polite
            progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
        }
    else this
