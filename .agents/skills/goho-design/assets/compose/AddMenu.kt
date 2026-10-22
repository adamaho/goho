package com.adamaho.goho.ui.components

import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Actions are supplied in their visible top-to-bottom order. */
data class AddMenuAction(
    @StringRes val label: Int,
    @DrawableRes val icon: Int,
    val onClick: () -> Unit,
)

/** Modal action stack; the caller keeps one AddButton mounted above this overlay. */
@Composable
fun AddMenu(
    open: Boolean,
    actions: List<AddMenuAction>,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GohoTheme.colors
    val reduced = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    val transition = updateTransition(open, label = "Add menu")
    val scrimOpacity =
        transition.animateFloat(
            transitionSpec = {
                tween(
                    durationMillis =
                        if (reduced) 0
                        else if (targetState) GohoMotion.ADD_MENU_SCRIM_ENTER_MILLIS
                        else GohoMotion.ADD_MENU_SCRIM_EXIT_MILLIS,
                    easing = LinearEasing,
                )
            },
            label = "Add menu scrim opacity",
        ) {
            if (it) 1f else 0f
        }
    // Restoring an already-open menu must not replay entry motion or haptics.
    val actionProgress =
        remember(actions.map { it.label }) { actions.map { Animatable(if (open) 1f else 0f) } }
    LaunchedEffect(open, reduced, actionProgress) {
        val target = if (open) 1f else 0f
        // Reveal from the button upwards; dismiss in the opposite order.
        val ordered = if (open) actionProgress.asReversed() else actionProgress
        ordered.forEachIndexed { index, animation ->
            if (animation.value == target && animation.targetValue == target) return@forEachIndexed
            if (reduced) {
                animation.snapTo(target)
            } else {
                // Space the actual starts, even when a busy frame delays the first entry.
                // The first entry also leaves a beat after the Add press haptic.
                if (open || index > 0) delay(GohoMotion.ADD_MENU_STAGGER_MILLIS)
                if (open) haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                launch {
                    animation.animateTo(
                        target,
                        if (open) GohoMotion.addMenuEnter
                        else tween(GohoMotion.ADD_MENU_EXIT_MILLIS),
                    )
                }
            }
        }
    }
    BackHandler(enabled = open, onBack = onDismiss)
    if (
        !transition.currentState && !transition.targetState && actionProgress.all { it.value == 0f }
    )
        return

    val firstActionFocus = remember { FocusRequester() }
    LaunchedEffect(open) { if (open && actions.isNotEmpty()) firstActionFocus.requestFocus() }
    Box(modifier.fillMaxSize()) {
        Box(
            Modifier.fillMaxSize()
                .drawBehind {
                    // Read opacity during drawing so the fade does not recompose the action stack.
                    drawRect(colors.scrim.copy(alpha = colors.scrim.alpha * scrimOpacity.value))
                }
                .focusProperties { canFocus = false }
                .clickable(
                    remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss,
                )
                .clearAndSetSemantics {}
        )
        val title = stringResource(R.string.add_menu_title)
        Column(
            Modifier.align(Alignment.BottomEnd)
                .windowInsetsPadding(WindowInsets.systemBars.union(WindowInsets.displayCutout))
                .padding(
                    start = GohoSpacing.screenMargin,
                    end = GohoSpacing.fabMarginEnd,
                    top = GohoSpacing.screenMargin,
                    bottom =
                        GohoSpacing.fabBottom +
                            GohoSpacing.addButton +
                            GohoSpacing.addMenuButtonGap - GohoSpacing.addMenuShadowPadding,
                )
                .then(
                    if (open)
                        Modifier.semantics {
                            paneTitle = title
                            isTraversalGroup = true
                        }
                    else Modifier.clearAndSetSemantics {}
                )
                .verticalScroll(rememberScrollState())
                .padding(vertical = GohoSpacing.addMenuShadowPadding),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(GohoSpacing.addMenuGap),
        ) {
            actions.forEachIndexed { index, action ->
                key(action.label) {
                    AddMenuRow(
                        action = action,
                        enabled = open,
                        onClick = {
                            onDismiss()
                            action.onClick()
                        },
                        modifier =
                            Modifier.graphicsLayer {
                                    val reveal = actionProgress[index].value
                                    compositingStrategy = CompositingStrategy.ModulateAlpha
                                    alpha = reveal.coerceIn(0f, 1f)
                                    translationY =
                                        if (reduced) 0f
                                        else (1f - reveal) * GohoMotion.addMenuTranslation.toPx()
                                    val scale =
                                        if (reduced) 1f
                                        else
                                            GohoMotion.ADD_MENU_START_SCALE +
                                                (1f - GohoMotion.ADD_MENU_START_SCALE) * reveal
                                    scaleX = scale
                                    scaleY = scale
                                }
                                .then(
                                    if (index == 0) Modifier.focusRequester(firstActionFocus)
                                    else Modifier
                                ),
                    )
                }
            }
        }
    }
}

@Composable
private fun AddMenuRow(
    action: AddMenuAction,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val colors = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val pressed = progress.coerceIn(0f, 1f)
    Row(
        modifier
            .heightIn(min = GohoSpacing.buttonHeight)
            .pressFeedback { progress }
            .shadow(
                GohoSpacing.sheetElevation * (1f - pressed),
                GohoShapes.pill,
                clip = false,
                ambientColor = colors.shadow,
                spotColor = colors.shadow,
            )
            .background(
                lerp(
                    colors.sheet,
                    if (colors.isDark) colors.surfaceMutedPressed else colors.surfacePressed,
                    pressed,
                ),
                GohoShapes.pill,
            )
            .border(GohoSpacing.hairline, colors.sheetRing, GohoShapes.pill)
            .clickable(
                interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(
                start = GohoSpacing.addMenuStart,
                end = GohoSpacing.buttonHorizontal,
                top = GohoSpacing.contentGap,
                bottom = GohoSpacing.contentGap,
            ),
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.buttonGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painterResource(action.icon),
            contentDescription = null,
            tint = colors.onAccentContainer,
            modifier = Modifier.size(GohoSpacing.addMenuIcon),
        )
        Text(
            stringResource(action.label),
            style = GohoTheme.type.rowTitle,
            color = colors.textPrimary,
            modifier = Modifier.weight(1f, fill = false),
        )
    }
}
