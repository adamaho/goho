package com.goho.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.goho.ui.theme.*
import kotlin.math.abs
import kotlinx.coroutines.launch

// Reference only (not compiled). Behaviour: references/screens.md section 7.

/** One top-level Goho section. The ordered registry drives the menu, the title swipe and the Add menu. */
@Immutable
data class Section(
    val id: String,
    val title: String,
    val icon: ImageVector,
    /** Null until loaded; the menu hides unknown counts rather than showing 0. */
    val count: Int?,
    val scanLabel: String,
    val scanIcon: ImageVector,
    val onScan: () -> Unit,
)

private const val SECTION_MENU_MILLIS = 160
private const val TITLE_ROLL_MILLIS = 220
private val TitleSwipeThreshold = 24.dp
private const val TITLE_FLING_DP_PER_SECOND = 1_000f
private val TitleRubberBand = 8.dp

/** Section title with chevron: tap opens [SectionMenu]; a short vertical swipe changes section. */
@Composable
fun SectionTitle(
    sections: List<Section>,
    currentId: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = GohoTheme.colors
    val reduced = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val index = sections.indexOfFirst { it.id == currentId }.coerceAtLeast(0)
    var menuOpen by remember { mutableStateOf(false) }
    // Drag offset in px: negative = swiping up toward the next section.
    val offset = remember { Animatable(0f) }
    val rowHeightPx = with(density) { GohoSpacing.headerHeight.toPx() }
    val thresholdPx = with(density) { TitleSwipeThreshold.toPx() }
    val rubberPx = with(density) { TitleRubberBand.toPx() }

    fun neighbour(direction: Int) = sections.getOrNull(index + direction)

    val chevronTurn by animateFloatAsState(
        if (menuOpen) 180f else 0f,
        if (reduced) tween(0) else tween(SECTION_MENU_MILLIS),
        label = "chevron",
    )

    Box(modifier.padding(start = GohoSpacing.textInsetFromMargin).heightIn(min = GohoSpacing.headerHeight)) {
        val dragState = rememberDraggableState { delta ->
            val next = offset.value + delta
            val direction = if (next < 0) 1 else -1
            val limited = if (neighbour(direction) == null) next.coerceIn(-rubberPx, rubberPx) else next
            scope.launch { offset.snapTo(limited.coerceIn(-rowHeightPx, rowHeightPx)) }
        }
        val interaction = remember { MutableInteractionSource() }
        Row(
            Modifier
                .heightIn(min = GohoSpacing.headerHeight)
                .clickable(interaction, indication = null, enabled = enabled, role = Role.Button) { menuOpen = true }
                .draggable(
                    dragState,
                    Orientation.Vertical,
                    enabled = enabled && !menuOpen,
                    onDragStopped = { velocity ->
                        val velocityDp = with(density) { velocity.toDp().value }
                        val direction = when {
                            offset.value < -thresholdPx || velocityDp < -TITLE_FLING_DP_PER_SECOND -> 1
                            offset.value > thresholdPx || velocityDp > TITLE_FLING_DP_PER_SECOND -> -1
                            else -> 0
                        }
                        val target = neighbour(direction)
                        if (direction != 0 && target != null) {
                            if (!reduced) {
                                offset.animateTo(
                                    -direction * rowHeightPx,
                                    tween(TITLE_ROLL_MILLIS, easing = FastOutSlowInEasing),
                                )
                            }
                            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                            onSelect(target.id)
                            offset.snapTo(0f)
                        } else {
                            offset.animateTo(0f, spring(dampingRatio = 0.8f, stiffness = 400f))
                        }
                    },
                )
                .semantics(mergeDescendants = true) {
                    contentDescription = "Section: ${sections[index].title}. Double-tap to change"
                    customActions = listOfNotNull(
                        neighbour(1)?.let { s -> CustomAccessibilityAction("Next section") { onSelect(s.id); true } },
                        neighbour(-1)?.let { s -> CustomAccessibilityAction("Previous section") { onSelect(s.id); true } },
                    )
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RollingTitle(sections, index, offset.value, rowHeightPx)
            Box(Modifier.padding(start = 2.dp).size(28.dp), contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Rounded.KeyboardArrowDown,
                    contentDescription = null,
                    tint = colors.textSecondary,
                    modifier = Modifier.size(18.dp).graphicsLayer { rotationZ = chevronTurn },
                )
            }
        }
        if (menuOpen) {
            SectionMenu(sections, currentId, onDismiss = { menuOpen = false }) { id ->
                menuOpen = false
                if (id != currentId) onSelect(id)
            }
        }
    }
}

/** Outgoing name follows the finger and fades; the incoming one enters one title height away. */
@Composable
private fun RollingTitle(sections: List<Section>, index: Int, offsetPx: Float, rowHeightPx: Float) {
    val colors = GohoTheme.colors
    val progress = (abs(offsetPx) / rowHeightPx).coerceIn(0f, 1f)
    val incoming = sections.getOrNull(if (offsetPx < 0) index + 1 else index - 1)
    Box(Modifier.clip(androidx.compose.ui.graphics.RectangleShape)) {
        Text(
            sections[index].title,
            style = GohoTheme.type.screenTitle,
            color = colors.textPrimary,
            modifier = Modifier.graphicsLayer { translationY = offsetPx; alpha = 1f - progress },
        )
        if (incoming != null && progress > 0f) {
            Text(
                incoming.title,
                style = GohoTheme.type.screenTitle,
                color = colors.textPrimary,
                modifier = Modifier.graphicsLayer {
                    translationY = offsetPx + if (offsetPx < 0) rowHeightPx else -rowHeightPx
                    alpha = progress
                },
            )
        }
    }
}

/** Small menu dropping from the title. No Material DropdownMenu: no ripples, Goho shapes only. */
@Composable
fun SectionMenu(
    sections: List<Section>,
    currentId: String,
    onDismiss: () -> Unit,
    onChoose: (String) -> Unit,
) {
    val colors = GohoTheme.colors
    val reduced = rememberReducedMotion()
    val enter = remember { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduced) enter.animateTo(1f, tween(SECTION_MENU_MILLIS)) }
    val offsetY = with(LocalDensity.current) { (GohoSpacing.headerHeight + 4.dp).roundToPx() }
    Popup(
        offset = IntOffset(0, offsetY),
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(
            Modifier
                .widthIn(min = 240.dp)
                .graphicsLayer {
                    alpha = enter.value
                    val s = 0.96f + 0.04f * enter.value
                    scaleX = s
                    scaleY = s
                    transformOrigin = TransformOrigin(0f, 0f)
                }
                .sheetSurface(colors, GohoShapes.sectionMenu) // sheet fill, ring and shadow per tokens.md
                .padding(6.dp)
                .semantics { role = Role.DropdownList },
        ) {
            sections.forEach { section ->
                val selected = section.id == currentId
                val interaction = remember { MutableInteractionSource() }
                val pressed by interaction.collectIsPressedAsState()
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .clip(androidx.compose.foundation.shape.RoundedCornerShape(14.dp))
                        .background(
                            when {
                                selected -> colors.accentContainer
                                pressed -> if (colors.isDark) colors.surfaceMutedPressed else colors.surfacePressed
                                else -> androidx.compose.ui.graphics.Color.Transparent
                            }
                        )
                        .clickable(interaction, indication = null, role = Role.RadioButton) { onChoose(section.id) }
                        .semantics { this.selected = selected }
                        .padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    val tint = if (selected) colors.onAccentContainer else colors.textSecondary
                    Icon(section.icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
                    Text(
                        section.title,
                        style = GohoTheme.type.rowTitle,
                        color = if (selected) colors.onAccentContainer else colors.textPrimary,
                        modifier = Modifier.weight(1f),
                    )
                    section.count?.let {
                        Text(
                            it.toString(),
                            style = GohoTheme.type.meta,
                            color = if (selected) colors.onAccentContainer else colors.textTertiary,
                        )
                    }
                }
            }
        }
    }
}
