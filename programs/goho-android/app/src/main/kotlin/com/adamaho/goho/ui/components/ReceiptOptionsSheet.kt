package com.adamaho.goho.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** One receipt header stays mounted while the actions below change inside the same sheet. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ReceiptOptionsSheet(
    merchant: String,
    metadata: @Composable () -> Unit,
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
            Row(
                Modifier.fillMaxWidth()
                    .padding(horizontal = GohoSpacing.sheetPadding)
                    .padding(top = GohoSpacing.sheetHeaderTop),
                horizontalArrangement = Arrangement.spacedBy(GohoSpacing.sheetHeaderGap),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                thumbnail()
                Column(
                    Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(GohoSpacing.sheetSummaryLineGap),
                ) {
                    Text(
                        merchant,
                        style = GohoTheme.type.sheetMerchant,
                        color = c.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    metadata()
                }
            }
            Spacer(Modifier.height(GohoSpacing.sheetContentTop))
            AnimatedContent(
                targetState = confirming,
                contentAlignment = Alignment.TopStart,
                transitionSpec = {
                    (fadeIn(
                            tween(
                                if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_IN_MILLIS,
                                delayMillis =
                                    if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_OUT_MILLIS,
                            )
                        ) togetherWith
                            fadeOut(
                                tween(if (reduced) 0 else GohoMotion.SHEET_CONTENT_FADE_OUT_MILLIS)
                            ))
                        .using(
                            SizeTransform { _, _ ->
                                tween(
                                    if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS,
                                    easing = FastOutSlowInEasing,
                                )
                            }
                        )
                },
                label = "Receipt sheet content",
            ) { showConfirmation ->
                if (!showConfirmation) {
                    Column(Modifier.fillMaxWidth()) {
                        Box(
                            Modifier.fillMaxWidth()
                                .padding(horizontal = GohoSpacing.sheetPadding)
                                .height(GohoSpacing.hairline)
                                .background(c.divider)
                        )
                        Spacer(Modifier.height(GohoSpacing.sheetMenuTop))
                        val interaction = remember { MutableInteractionSource() }
                        val progress by pressProgress(interaction)
                        Row(
                            Modifier.fillMaxWidth()
                                .background(
                                    lerp(
                                        c.sheet,
                                        if (c.isDark) c.surfaceMutedPressed else c.surfacePressed,
                                        progress.coerceIn(0f, 1f),
                                    )
                                )
                                .clickable(
                                    interaction,
                                    indication = null,
                                    role = Role.Button,
                                    enabled = !confirming,
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
                            TrashIcon(
                                c.onDangerContainer,
                                Modifier.size(GohoSpacing.sheetActionIcon),
                            )
                            Text(
                                stringResource(R.string.receipt_delete),
                                style = GohoTheme.type.rowTitle,
                                color = c.onDangerContainer,
                            )
                        }
                        Spacer(Modifier.height(GohoSpacing.sheetInset))
                    }
                } else {
                    val focus = remember { FocusRequester() }
                    LaunchedEffect(Unit) { focus.requestFocus() }
                    Column(
                        Modifier.fillMaxWidth()
                            .padding(horizontal = GohoSpacing.sheetPadding)
                            .padding(bottom = GohoSpacing.sheetPadding)
                    ) {
                        Text(
                            title,
                            style = GohoTheme.type.title,
                            color = c.textPrimary,
                            modifier =
                                Modifier.focusRequester(focus).focusable().semantics { heading() },
                        )
                        if (failed) {
                            Spacer(Modifier.height(GohoSpacing.sheetErrorTop))
                            Text(
                                stringResource(R.string.receipt_delete_failed),
                                style = GohoTheme.type.body,
                                color = c.onDangerContainer,
                                modifier =
                                    Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            )
                        }
                        Spacer(Modifier.height(GohoSpacing.sheetButtonsTop))
                        GohoActionButton(
                            stringResource(
                                if (deleting) R.string.receipt_deleting else R.string.receipt_delete
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
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
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
        }
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
