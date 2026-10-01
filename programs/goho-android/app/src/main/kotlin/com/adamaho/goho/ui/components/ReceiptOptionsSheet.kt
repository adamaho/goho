package com.adamaho.goho.ui.components

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateRectAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.AbsoluteAlignment
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.lerp
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * One sheet for options and confirmation; callers supply the receipt and supported delete action.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReceiptOptionsSheet(
    merchant: String,
    summary: String,
    confirmation: String,
    thumbnail: @Composable () -> Unit,
    onDelete: suspend () -> Boolean,
    onDismiss: () -> Unit,
) {
    val c = GohoTheme.colors
    val reduced = rememberReducedMotion()
    var confirming by rememberSaveable { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var deleted by remember { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val state =
        rememberModalBottomSheetState(
            skipPartiallyExpanded = true,
            confirmValueChange = { !deleting || deleted },
        )
    val confirmationAlpha by
        animateFloatAsState(
            if (confirming) 1f else 0f,
            if (reduced) snap() else GohoMotion.sheetConfirmation,
            label = "Receipt confirmation reveal",
        )
    val title =
        stringResource(if (confirming) R.string.receipt_delete_title else R.string.receipt_options)
    fun dismiss() {
        if (!deleting)
            scope.launch {
                state.hide()
                onDismiss()
            }
    }
    ModalBottomSheet(
        onDismissRequest = { if (!deleting) onDismiss() },
        sheetState = state,
        containerColor = Color.Transparent,
        scrimColor = c.scrim,
        tonalElevation = GohoSpacing.flatElevation,
        dragHandle = null,
        sheetGesturesEnabled = !deleting,
        contentWindowInsets = { WindowInsets.safeDrawing.only(WindowInsetsSides.Top) },
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = !deleting),
    ) {
        Column(
            Modifier.fillMaxWidth()
                .navigationBarsPadding()
                .padding(GohoSpacing.sheetInset)
                .shadow(
                    GohoSpacing.sheetElevation,
                    GohoShapes.sheet,
                    ambientColor = c.shadow,
                    spotColor = c.shadow,
                )
                .clip(GohoShapes.sheet)
                .background(c.sheet)
                .animateContentSize(tween(if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS))
                .verticalScroll(rememberScrollState())
                .semantics { paneTitle = title }
        ) {
            Box(
                Modifier.align(Alignment.CenterHorizontally)
                    .padding(top = GohoSpacing.sheetInset)
                    .size(GohoSpacing.sheetGrabberWidth, GohoSpacing.sheetGrabberHeight)
                    .clip(GohoShapes.pill)
                    .background(c.grabber)
            )
            var bodyCoordinates by remember { mutableStateOf<LayoutCoordinates?>(null) }
            var iconTarget by remember { mutableStateOf<Rect?>(null) }
            val iconBounds by
                animateRectAsState(
                    iconTarget ?: Rect.Zero,
                    if (reduced || !confirming) snap() else GohoMotion.sheetIconBounds,
                    label = "Receipt delete icon",
                )
            val iconSlot: @Composable (Boolean) -> Unit = { large ->
                Spacer(
                    Modifier.size(
                            if (large) GohoSpacing.sheetConfirmIconCircle
                            else GohoSpacing.sheetActionIconCircle
                        )
                        .onGloballyPositioned { coordinates ->
                            bodyCoordinates
                                ?.takeIf { it.isAttached }
                                ?.let { body ->
                                    val origin = body.localPositionOf(coordinates, Offset.Zero)
                                    iconTarget =
                                        Rect(
                                            origin,
                                            androidx.compose.ui.geometry.Size(
                                                coordinates.size.width.toFloat(),
                                                coordinates.size.height.toFloat(),
                                            ),
                                        )
                                }
                        }
                )
            }
            Box(Modifier.fillMaxWidth().onGloballyPositioned { bodyCoordinates = it }) {
                Column(Modifier.fillMaxWidth()) {
                    if (!confirming) {
                        Row(
                            Modifier.fillMaxWidth()
                                .padding(
                                    horizontal = GohoSpacing.sheetPadding,
                                    vertical = GohoSpacing.sheetSummaryVertical,
                                ),
                            horizontalArrangement = Arrangement.spacedBy(GohoSpacing.thumbToText),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            thumbnail()
                            Column(
                                Modifier.weight(1f),
                                verticalArrangement =
                                    Arrangement.spacedBy(GohoSpacing.sheetSummaryLineGap),
                            ) {
                                Text(
                                    merchant,
                                    style = GohoTheme.type.rowTitle,
                                    color = c.textPrimary,
                                )
                                Text(summary, style = GohoTheme.type.meta, color = c.textTertiary)
                            }
                        }
                        Box(
                            Modifier.fillMaxWidth()
                                .padding(horizontal = GohoSpacing.sheetPadding)
                                .height(GohoSpacing.hairline)
                                .background(c.divider)
                        )
                        val interaction = remember { MutableInteractionSource() }
                        val progress by pressProgress(interaction)
                        Row(
                            Modifier.fillMaxWidth()
                                .gohoPress { progress }
                                .background(
                                    lerp(c.sheet, c.surfacePressed, progress.coerceIn(0f, 1f))
                                )
                                .clickable(
                                    interaction,
                                    indication = null,
                                    role = Role.Button,
                                    onClick = { confirming = true },
                                )
                                .heightIn(min = GohoSpacing.sheetActionHeight)
                                .padding(
                                    horizontal = GohoSpacing.sheetPadding,
                                    vertical = GohoSpacing.sheetInset,
                                ),
                            horizontalArrangement =
                                Arrangement.spacedBy(GohoSpacing.sheetActionGap),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            iconSlot(false)
                            Text(
                                stringResource(R.string.receipt_delete),
                                style = GohoTheme.type.rowTitle,
                                color = c.onDangerContainer,
                            )
                        }
                        Spacer(Modifier.height(GohoSpacing.sheetInset))
                    } else {
                        val focus = remember { FocusRequester() }
                        LaunchedEffect(Unit) { focus.requestFocus() }
                        Column(
                            Modifier.fillMaxWidth()
                                .padding(GohoSpacing.sheetPadding)
                                .graphicsLayer { alpha = confirmationAlpha }
                        ) {
                            iconSlot(true)
                            Spacer(Modifier.height(GohoSpacing.sheetTitleTop))
                            Text(
                                title,
                                style = GohoTheme.type.title,
                                color = c.textPrimary,
                                modifier =
                                    Modifier.focusRequester(focus).focusable().semantics {
                                        heading()
                                    },
                            )
                            Spacer(Modifier.height(GohoSpacing.sectionLabelBottom))
                            Text(
                                if (failed) stringResource(R.string.receipt_delete_failed)
                                else confirmation,
                                style = GohoTheme.type.body,
                                color = if (failed) c.onDangerContainer else c.textSecondary,
                                modifier =
                                    Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            )
                            Spacer(Modifier.height(GohoSpacing.sheetButtonsTop))
                            GohoActionButton(
                                stringResource(
                                    if (deleting) R.string.receipt_deleting
                                    else R.string.receipt_delete
                                ),
                                onClick = {
                                    if (!deleting) {
                                        deleting = true
                                        failed = false
                                        scope.launch {
                                            val success =
                                                try {
                                                    onDelete()
                                                } catch (error: Exception) {
                                                    if (error is CancellationException) throw error
                                                    false
                                                }
                                            if (success) {
                                                deleted = true
                                                state.hide()
                                                onDismiss()
                                            } else {
                                                deleting = false
                                                failed = true
                                            }
                                        }
                                    }
                                },
                                enabled = !deleting,
                                destructive = true,
                                icon = {
                                    TrashIcon(c.onDanger, Modifier.size(GohoSpacing.buttonIcon))
                                },
                                modifier =
                                    Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            )
                            Spacer(Modifier.height(GohoSpacing.buttonGap))
                            GohoActionButton(
                                stringResource(R.string.receipt_cancel),
                                ::dismiss,
                                primary = false,
                                enabled = !deleting,
                            )
                        }
                    }
                }
                // This instance stays mounted while its measured destination changes between
                // states.
                if (iconTarget != null) {
                    val diameter = with(LocalDensity.current) { iconBounds.width.toDp() }
                    val progress =
                        ((diameter - GohoSpacing.sheetActionIconCircle) /
                                (GohoSpacing.sheetConfirmIconCircle -
                                    GohoSpacing.sheetActionIconCircle))
                            .coerceIn(0f, 1f)
                    DangerCircle(
                        Modifier.align(AbsoluteAlignment.TopLeft)
                            .absoluteOffset {
                                IntOffset(iconBounds.left.roundToInt(), iconBounds.top.roundToInt())
                            }
                            .size(diameter),
                        lerp(GohoSpacing.buttonIcon, GohoSpacing.sheetConfirmIcon, progress),
                    )
                }
            }
        }
    }
}

@Composable
private fun DangerCircle(modifier: Modifier, iconSize: Dp) {
    Box(
        modifier.clip(GohoShapes.pill).background(GohoTheme.colors.dangerContainer),
        contentAlignment = Alignment.Center,
    ) {
        TrashIcon(
            GohoTheme.colors.onDangerContainer,
            Modifier.size(iconSize),
        )
    }
}

@Composable
private fun TrashIcon(color: Color, modifier: Modifier) {
    Canvas(modifier) {
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(
                color,
                Offset(size.width * x1, size.height * y1),
                Offset(size.width * x2, size.height * y2),
                GohoSpacing.iconStroke.toPx(),
                StrokeCap.Round,
            )
        line(.18f, .28f, .82f, .28f)
        line(.38f, .28f, .38f, .13f)
        line(.38f, .13f, .62f, .13f)
        line(.62f, .13f, .62f, .28f)
        line(.27f, .29f, .31f, .87f)
        line(.31f, .87f, .69f, .87f)
        line(.69f, .87f, .73f, .29f)
        line(.43f, .43f, .43f, .71f)
        line(.57f, .43f, .57f, .71f)
    }
}
