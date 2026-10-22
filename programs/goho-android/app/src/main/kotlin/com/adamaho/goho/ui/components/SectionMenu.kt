package com.adamaho.goho.ui.components

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.LayerOutsets
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.adamaho.goho.R
import com.adamaho.goho.theme.*

/** Null counts are unknown and omitted. Entries are supplied in display order. */
data class SectionMenuEntry(
    @StringRes val label: Int,
    @DrawableRes val icon: Int,
    val selected: Boolean = false,
    val count: String? = null,
    val onClick: () -> Unit,
)

@Composable
private fun sectionMenuProgress(open: Boolean): State<Float> {
    val reduced = rememberReducedMotion()
    val transition = updateTransition(open, label = "Section menu")
    return transition.animateFloat(
        transitionSpec = {
            tween(
                if (reduced) 0
                else if (targetState) GohoMotion.SECTION_MENU_ENTER_MILLIS
                else GohoMotion.SECTION_MENU_EXIT_MILLIS
            )
        },
        label = "Section menu reveal",
    ) {
        if (it) 1f else 0f
    }
}

/** Draw above the screen content; the anchored popup owns modal focus and Back. */
@Composable
fun SectionMenuScrim(open: Boolean, onDismiss: () -> Unit) {
    val progress = sectionMenuProgress(open)
    if (!open && progress.value == 0f) return
    val color = GohoTheme.colors.scrim
    Box(
        Modifier.fillMaxSize()
            .drawBehind {
                drawRect(
                    color.copy(
                        alpha = color.alpha * GohoMotion.SECTION_MENU_SCRIM_ALPHA * progress.value
                    )
                )
            }
            .focusProperties { canFocus = false }
            .clickable(
                remember { MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            )
            .clearAndSetSemantics {}
    )
}

/** Place in a Box matching the title row, aligned with the screen margin. */
@Composable
fun SectionMenu(
    open: Boolean,
    entries: List<SectionMenuEntry>,
    onDismiss: () -> Unit,
    onClosed: () -> Unit,
) {
    val progress = sectionMenuProgress(open)
    val visible = open || progress.value > 0f
    var restoreFocus by remember { mutableStateOf(false) }
    val currentOnClosed by rememberUpdatedState(onClosed)
    LaunchedEffect(visible) {
        if (visible) restoreFocus = true
        else if (restoreFocus) {
            restoreFocus = false
            currentOnClosed()
        }
    }
    if (!visible) return
    val colors = GohoTheme.colors
    val config = LocalConfiguration.current
    val layoutDirection = LocalLayoutDirection.current
    val density = LocalDensity.current
    val margin = with(density) { GohoSpacing.screenMargin.roundToPx() }
    val gap = with(density) { GohoSpacing.sectionMenuOffset.roundToPx() }
    val position =
        remember(margin, gap) {
            object : PopupPositionProvider {
                override fun calculatePosition(
                    anchorBounds: IntRect,
                    windowSize: IntSize,
                    layoutDirection: LayoutDirection,
                    popupContentSize: IntSize,
                ): IntOffset {
                    val start =
                        if (layoutDirection == LayoutDirection.Ltr) anchorBounds.left
                        else anchorBounds.right - popupContentSize.width
                    return IntOffset(
                        start.coerceIn(
                            margin,
                            (windowSize.width - margin - popupContentSize.width).coerceAtLeast(
                                margin
                            ),
                        ),
                        (anchorBounds.bottom + gap).coerceAtMost(
                            (windowSize.height - margin - popupContentSize.height).coerceAtLeast(
                                margin
                            )
                        ),
                    )
                }
            }
        }
    val selectedFocus = remember { FocusRequester() }
    val selectedIndex = entries.indexOfFirst { it.selected }.coerceAtLeast(0)
    val pane = stringResource(R.string.section_menu_title)
    Popup(position, onDismissRequest = onDismiss, properties = PopupProperties(focusable = true)) {
        LaunchedEffect(open) { if (open && entries.isNotEmpty()) selectedFocus.requestFocus() }
        Column(
            Modifier.width(
                    (GohoSpacing.sectionMenuWidth * config.fontScale).coerceAtMost(
                        config.screenWidthDp.dp - GohoSpacing.screenMargin * 2
                    )
                )
                .heightIn(
                    max =
                        (config.screenHeightDp.dp -
                                GohoSpacing.headerHeight -
                                GohoSpacing.headerTop -
                                GohoSpacing.sectionMenuOffset -
                                GohoSpacing.screenMargin * 2)
                            .coerceAtLeast(GohoSpacing.sectionMenuRow)
                )
                .graphicsLayer {
                    // Fade the surface, rows and shadow as one image. Modulating each
                    // draw separately leaves the shadow visible through the fading face.
                    compositingStrategy = CompositingStrategy.Offscreen
                    outsets = LayerOutsets(GohoSpacing.sectionMenuShadowPadding)
                    alpha = progress.value
                    val scale =
                        GohoMotion.SECTION_MENU_START_SCALE +
                            (1f - GohoMotion.SECTION_MENU_START_SCALE) * progress.value
                    scaleX = scale
                    scaleY = scale
                    transformOrigin =
                        TransformOrigin(if (layoutDirection == LayoutDirection.Ltr) 0f else 1f, 0f)
                }
                .shadow(
                    GohoSpacing.sheetElevation,
                    GohoShapes.sectionMenu,
                    clip = false,
                    ambientColor = colors.shadow,
                    spotColor = colors.shadow,
                )
                .background(colors.sheet, GohoShapes.sectionMenu)
                .border(GohoSpacing.hairline, colors.sheetRing, GohoShapes.sectionMenu)
                .then(
                    if (open)
                        Modifier.semantics {
                            paneTitle = pane
                            isTraversalGroup = true
                        }
                    else Modifier.clearAndSetSemantics {}
                )
                .padding(GohoSpacing.sectionMenuPadding)
                .verticalScroll(rememberScrollState())
        ) {
            entries.forEachIndexed { index, entry ->
                SectionMenuRow(
                    entry,
                    enabled = open,
                    onClick = {
                        onDismiss()
                        entry.onClick()
                    },
                    modifier =
                        if (index == selectedIndex) Modifier.focusRequester(selectedFocus)
                        else Modifier,
                )
            }
        }
    }
}

@Composable
private fun SectionMenuRow(
    entry: SectionMenuEntry,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val colors = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = GohoSpacing.sectionMenuRow)
            .pressFeedback { progress }
            .background(
                lerp(
                    if (entry.selected) colors.accentContainer else colors.sheet,
                    if (colors.isDark) colors.surfaceMutedPressed else colors.surfacePressed,
                    progress.coerceIn(0f, 1f),
                ),
                GohoShapes.heldRow,
            )
            // A selected radio control loses its accessibility click action on Android.
            // These are menu actions: the current section must still be able to dismiss.
            .semantics { selected = entry.selected }
            .clickable(
                enabled = enabled,
                role = Role.Button,
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(
                horizontal = GohoSpacing.sectionMenuRowHorizontal,
                vertical = GohoSpacing.sectionMenuPadding,
            ),
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.contentGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painterResource(entry.icon),
            contentDescription = null,
            tint = if (entry.selected) colors.onAccentContainer else colors.textSecondary,
            modifier = Modifier.size(GohoSpacing.sectionMenuIcon),
        )
        Text(
            stringResource(entry.label),
            style = GohoTheme.type.rowTitle,
            color = if (entry.selected) colors.onAccentContainer else colors.textPrimary,
            modifier = Modifier.weight(1f),
        )
        entry.count?.let {
            Text(
                it,
                style = GohoTheme.type.meta,
                color = if (entry.selected) colors.onAccentContainer else colors.textTertiary,
            )
        }
    }
}
