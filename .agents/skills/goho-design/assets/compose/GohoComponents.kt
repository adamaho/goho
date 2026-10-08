// Goho UI primitives. Reference implementation from the design handoff; not compiled
// against the project, so fix any API drift for the project's Compose version.
// Bram status content and delayed receipt-loading icons follow the current screen specs.
package com.goho.ui.components // TODO: match the app's package

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.snap
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.aspectRatio
import android.provider.Settings
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.delay
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.goho.ui.theme.GohoMotion
import com.goho.ui.theme.GohoShapes
import com.goho.ui.theme.GohoSpacing
import com.goho.ui.theme.GohoTheme
import androidx.compose.ui.graphics.lerp as lerpColor

// ---------- Motion helpers ----------

/** True when the system "Remove animations" setting is on. */
@Composable
fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/** 0 at rest, 1 when pressed; springs back past 0 on release for the friendly bounce. */
@Composable
fun pressProgress(interactionSource: MutableInteractionSource): State<Float> {
    val pressed by interactionSource.collectIsPressedAsState()
    val reduced = rememberReducedMotion()
    return animateFloatAsState(
        targetValue = if (pressed && !reduced) 1f else 0f,
        animationSpec = when {
            reduced -> snap()
            pressed -> GohoMotion.pressIn
            else -> GohoMotion.pressOut
        },
        label = "gohoPress",
    )
}

/** The Goho press: scale to 97% and move down 1dp. Never a sunken state. */
fun Modifier.gohoPressTransform(progress: () -> Float): Modifier = graphicsLayer {
    val p = progress()
    val scale = 1f - GohoMotion.PRESS_SCALE * p
    scaleX = scale
    scaleY = scale
    translationY = GohoMotion.pressTranslation.toPx() * p.coerceIn(0f, 1f)
}

/** 1dp highlight along the top edge, drawn inside the already-clipped shape. */
fun Modifier.topHighlight(color: Color): Modifier = drawWithContent {
    drawContent()
    val stroke = 1.dp.toPx()
    drawLine(color, Offset(0f, stroke / 2f), Offset(size.width, stroke / 2f), stroke)
}

@Composable
fun rememberShimmerBrush(base: Color, highlight: Color): Brush {
    if (rememberReducedMotion()) return SolidColor(base)
    val transition = rememberInfiniteTransition(label = "shimmer")
    val x by transition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(GohoMotion.SHIMMER_MILLIS, easing = LinearEasing)),
        label = "shimmerX",
    )
    return object : ShaderBrush() {
        override fun createShader(size: Size): Shader = LinearGradientShader(
            from = Offset(size.width * (x - 0.5f), 0f),
            to = Offset(size.width * (x + 0.5f), 0f),
            colors = listOf(base, highlight, base),
        )
    }
}

// ---------- Receipt loading ----------

// Drive this helper from actual pending work; each attempt restarts the delay.
// Initial loading uses description = "Loading receipts…" after 200ms, only before a list has loaded.
// Its host centers it horizontally in the list's notice position below the header.
// Retry uses the 18dp icon inside its disabled button; the outgoing recovery flag is not loading.
@Composable
internal fun rememberLoadingVisible(loading: Boolean): Boolean {
    var visible by remember(loading) { mutableStateOf(false) }
    LaunchedEffect(loading) {
        if (loading) {
            delay(GohoMotion.LOADING_DELAY_MILLIS)
            visible = true
        }
    }
    return loading && visible
}

@Composable
fun GohoLoadingIcon(
    modifier: Modifier = Modifier,
    description: String? = null,
    color: Color = GohoTheme.colors.textSecondary,
) {
    val rotation =
        if (rememberReducedMotion()) 0f
        else {
            val transition = rememberInfiniteTransition(label = "Loading")
            val angle by transition.animateFloat(
                initialValue = 0f,
                targetValue = 360f,
                animationSpec = infiniteRepeatable(tween(GohoMotion.LOADING_SPIN_MILLIS, easing = LinearEasing)),
                label = "Loading rotation",
            )
            angle
        }
    Canvas(
        modifier.size(GohoSpacing.loadingIcon)
            .then(
                if (description != null) Modifier.semantics {
                    contentDescription = description
                    progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
                    liveRegion = LiveRegionMode.Polite
                } else Modifier
            )
            .rotate(rotation)
    ) {
        val stroke = GohoSpacing.iconStroke.toPx()
        drawArc(
            color = color,
            startAngle = -90f,
            sweepAngle = 270f,
            useCenter = false,
            topLeft = Offset(stroke / 2f, stroke / 2f),
            size = Size(size.width - stroke, size.height - stroke),
            style = Stroke(stroke, cap = StrokeCap.Round),
        )
    }
}

// ---------- Buttons ----------

@Composable
private fun GohoButtonBase(
    onClick: () -> Unit,
    modifier: Modifier,
    enabled: Boolean,
    minHeight: Dp,
    shape: Shape,
    shadowColor: Color,
    nearShadowAlpha: Float,
    wideShadowAlpha: Float,
    wideShadowSpread: Dp,
    fill: (Float) -> Brush,
    ring: Color,
    innerRing: Color,
    cornerRadius: Dp,
    contentPadding: PaddingValues,
    content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val p = if (enabled) progress.coerceIn(0f, 1f) else 0f
    Row(
        modifier = modifier
            .gohoPressTransform { if (enabled) progress else 0f }
            .alpha(if (enabled) 1f else 0.4f)
            .dropShadow(shape, Shadow(radius = 24.dp, spread = wideShadowSpread,
                offset = DpOffset(0.dp, 10.dp), color = shadowColor, alpha = wideShadowAlpha * (1f - p)))
            .dropShadow(shape, Shadow(radius = 2.dp,
                offset = DpOffset(0.dp, 1.dp), color = shadowColor, alpha = nearShadowAlpha))
            .clip(shape)
            .background(fill(p))
            .border(1.dp, ring, shape)
            .drawWithContent {
                drawContent()
                if (innerRing.alpha > 0f) {
                    val inset = 1.5.dp.toPx()
                    drawRoundRect(
                        color = innerRing,
                        topLeft = Offset(inset, inset),
                        size = Size(size.width - inset * 2, size.height - inset * 2),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius((cornerRadius - 1.5.dp).toPx()),
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.dp.toPx()),
                    )
                }
            }
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .heightIn(min = minHeight)
            .padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
fun GohoScanFab(onClick: () -> Unit, scanIcon: ImageVector, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    GohoButtonBase(
        onClick = onClick,
        modifier = modifier.semantics { contentDescription = "Scan receipt" },
        enabled = true,
        minHeight = 56.dp,
        shape = GohoShapes.fab,
        shadowColor = c.accentShadow,
        nearShadowAlpha = c.buttonShadowAlpha,
        wideShadowAlpha = c.buttonWideShadowAlpha,
        wideShadowSpread = (-8).dp,
        fill = { p -> SolidColor(lerpColor(c.accent, c.accentPressed, p)) },
        ring = c.accentRing,
        innerRing = c.buttonInnerRing,
        cornerRadius = 24.dp,
        contentPadding = PaddingValues(start = 18.dp, end = 22.dp),
    ) {
        Icon(scanIcon, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.onAccent)
        Text("Scan", style = GohoTheme.type.button, color = c.onAccent)
    }
}

enum class GohoButtonVariant { Primary, Secondary, Destructive }

@Composable
fun GohoActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: GohoButtonVariant = GohoButtonVariant.Primary,
    enabled: Boolean = true,
    icon: (@Composable () -> Unit)? = null,
    reserveSpaceFor: List<String> = emptyList(),
    loading: Boolean = false, // Already delayed by rememberLoadingVisible; disable immediately at the caller.
) {
    val c = GohoTheme.colors
    val secondary = variant == GohoButtonVariant.Secondary
    val contentColor = when (variant) {
        GohoButtonVariant.Primary -> c.onAccent
        GohoButtonVariant.Secondary -> c.textPrimary
        GohoButtonVariant.Destructive -> c.onDanger
    }
    val style = if (secondary) GohoTheme.type.buttonSecondary else GohoTheme.type.button
    GohoButtonBase(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().then(
            if (loading) Modifier.semantics {
                contentDescription = text
                progressBarRangeInfo = ProgressBarRangeInfo.Indeterminate
            } else Modifier
        ),
        enabled = enabled,
        minHeight = GohoSpacing.buttonHeight,
        shape = GohoShapes.button,
        shadowColor = when (variant) {
            GohoButtonVariant.Primary -> c.accentShadow
            GohoButtonVariant.Secondary -> c.shadow
            GohoButtonVariant.Destructive -> c.dangerShadow
        },
        nearShadowAlpha = if (secondary) c.secondaryShadowAlpha else c.buttonShadowAlpha,
        wideShadowAlpha = if (secondary) c.secondaryWideShadowAlpha else c.buttonWideShadowAlpha,
        wideShadowSpread = if (secondary) GohoSpacing.secondaryWideShadowSpread else GohoSpacing.buttonWideShadowSpread,
        fill = { p -> SolidColor(when (variant) {
            GohoButtonVariant.Primary -> lerpColor(c.accent, c.accentPressed, p)
            GohoButtonVariant.Secondary -> lerpColor(c.buttonSecondary, c.buttonSecondaryPressed, p)
            GohoButtonVariant.Destructive -> lerpColor(c.danger, c.dangerPressed, p)
        }) },
        ring = when (variant) {
            GohoButtonVariant.Primary -> c.accentRing
            GohoButtonVariant.Secondary -> c.secondaryRing
            GohoButtonVariant.Destructive -> c.dangerRing
        },
        innerRing = when (variant) {
            GohoButtonVariant.Primary -> c.buttonInnerRing
            GohoButtonVariant.Secondary -> Color.Transparent
            GohoButtonVariant.Destructive -> c.dangerInnerRing
        },
        cornerRadius = 20.dp,
        contentPadding = PaddingValues(horizontal = GohoSpacing.buttonHorizontal),
    ) {
        icon?.invoke()
        Box(contentAlignment = Alignment.Center) {
            reserveSpaceFor.forEach { label ->
                Text(label, style = style, textAlign = TextAlign.Center,
                    modifier = Modifier.clearAndSetSemantics {}.alpha(0f))
            }
            Text(text, style = style, color = contentColor, textAlign = TextAlign.Center,
                modifier = if (loading) Modifier.clearAndSetSemantics {}.alpha(0f) else Modifier)
            if (loading) GohoLoadingIcon(
                modifier = Modifier.size(GohoSpacing.buttonIcon),
                color = contentColor,
            )
        }
    }
}

@Composable
fun GohoIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    Box(
        modifier = modifier
            .gohoPressTransform { progress }
            .size(44.dp)
            .clip(CircleShape)
            .background(lerpColor(c.surfaceMuted, c.surfaceMutedPressed, progress.coerceIn(0f, 1f)))
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, modifier = Modifier.size(20.dp), tint = c.textPrimary)
    }
}

// ---------- Pills and badges ----------

enum class PillTone { Accent, Attention }

@Composable
fun GohoStatusPill(
    text: String,
    tone: PillTone,
    modifier: Modifier = Modifier,
    shimmer: Boolean = false,
) {
    val c = GohoTheme.colors
    val (bg, fg) = when (tone) {
        PillTone.Accent -> c.accentContainer to c.onAccentContainer
        PillTone.Attention -> c.attentionContainer to c.attention
    }
    Row(
        modifier
            .height(22.dp)
            .clip(GohoShapes.pill)
            .background(bg)
            .padding(horizontal = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        val style = GohoTheme.type.label
        if (shimmer) {
            Text(text, style = style.copy(brush = rememberShimmerBrush(fg, c.accentShimmer)))
        } else {
            Text(text, style = style, color = fg)
        }
    }
}

@Composable
fun GohoCountBadge(count: Int, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    Box(
        modifier
            .defaultMinSize(minWidth = 20.dp, minHeight = 20.dp)
            .clip(GohoShapes.pill)
            .background(c.attentionContainer)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("$count", style = GohoTheme.type.label, color = c.attention)
    }
}

// ---------- Filter ----------

data class FilterOption(val label: String, val count: Int, val isAttention: Boolean = false)

@Composable
fun GohoSegmentedFilter(
    options: List<FilterOption>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val labelStyle = GohoTheme.type.section.copy(fontSize = 14.sp, fontFeatureSettings = "'tnum' 0, 'pnum' 1")
    Row(
        modifier
            .clip(GohoShapes.pill)
            .background(c.surfaceMuted)
            .padding(3.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEachIndexed { index, option ->
            val selected = index == selectedIndex
            val bg by animateColorAsState(
                if (selected) c.segmentSelected else Color.Transparent,
                tween(GohoMotion.SEGMENT_MILLIS),
                label = "segmentBg",
            )
            val fg by animateColorAsState(
                if (selected) c.textPrimary else c.textSecondary,
                tween(GohoMotion.SEGMENT_MILLIS),
                label = "segmentFg",
            )
            Row(
                Modifier
                    .height(34.dp)
                    .then(
                        if (selected) Modifier.shadow(1.dp, GohoShapes.pill, clip = false, ambientColor = c.shadow, spotColor = c.shadow)
                        else Modifier
                    )
                    .clip(GohoShapes.pill)
                    .background(bg)
                    .then(if (selected && c.isDark) Modifier.topHighlight(Color.White.copy(alpha = 0.06f)) else Modifier)
                    .selectable(
                        selected = selected,
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        role = Role.Tab,
                        onClick = { onSelect(index) },
                    )
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Text(option.label, style = labelStyle, color = fg)
                if (option.isAttention) {
                    if (option.count > 0) GohoCountBadge(option.count)
                } else {
                    Text("${option.count}", style = labelStyle, color = c.textSecondary)
                }
            }
        }
    }
}

// ---------- Receipt rows and cards ----------

sealed interface ReceiptRowState {
    /** amount is the formatted number, for example "$46.78" or "23.21"; prefix is for foreign currency, for example "US$". Null amount shows "—". */
    data class Processed(val amount: String?, val foreignPrefix: String? = null) : ReceiptRowState
    data object Processing : ReceiptRowState
    data object NotProcessed : ReceiptRowState
}

@Composable
fun GohoAmountText(amount: String?, foreignPrefix: String?, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val style = GohoTheme.type.rowTitle
    if (amount == null) {
        Text("—", style = style, color = c.textTertiary, modifier = modifier)
        return
    }
    val text = buildAnnotatedString {
        if (foreignPrefix != null) withStyle(SpanStyle(color = c.textTertiary)) { append(foreignPrefix) }
        withStyle(SpanStyle(color = c.textPrimary)) { append(amount) }
    }
    Text(text, style = style, modifier = modifier)
}

@Composable
fun ReceiptThumbnail(
    processing: Boolean,
    modifier: Modifier = Modifier,
    image: @Composable BoxScope.() -> Unit,
) {
    val c = GohoTheme.colors
    Box(
        modifier
            .size(GohoSpacing.thumbWidth, GohoSpacing.thumbHeight)
            .clip(GohoShapes.thumb)
            .background(c.surfaceMuted)
            .border(1.dp, c.outline, GohoShapes.thumb),
    ) {
        image()
        if (processing) {
            Canvas(Modifier.fillMaxSize()) {
                val lineY = size.height * 0.45f
                val line = 1.5.dp.toPx()
                drawRect(c.accent.copy(alpha = 0.18f), size = Size(size.width, lineY))
                drawRect(c.accent, topLeft = Offset(0f, lineY - line), size = Size(size.width, line))
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ReceiptRow(
    merchant: String,
    dateLabel: String,
    state: ReceiptRowState,
    onClick: (() -> Unit)?, // Processed: open details. NotProcessed: open the options sheet. Processing: null.
    onLongClick: (() -> Unit)? = null, // open the options sheet; ignored for Processing rows
    modifier: Modifier = Modifier,
    thumbnail: @Composable () -> Unit,
) {
    val c = GohoTheme.colors
    val t = GohoTheme.type
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val haptics = LocalHapticFeedback.current
    val interactive = state !is ReceiptRowState.Processing && (onClick != null || onLongClick != null)
    // "Lifted" look once a press lasts long enough to look like a hold.
    var holding by remember { mutableStateOf(false) }
    LaunchedEffect(pressed) {
        holding = false
        if (pressed) { delay(150); holding = true }
    }
    val liftScale by animateFloatAsState(if (holding) 0.98f else 1f, spring(dampingRatio = 0.7f, stiffness = 600f), label = "rowLift")
    Row(
        modifier
            .fillMaxWidth()
            .graphicsLayer { scaleX = liftScale; scaleY = liftScale }
            .clip(RoundedCornerShape(if (holding) 14.dp else 0.dp))
            .background(if (pressed) c.surfacePressed else Color.Transparent)
            .then(
                if (interactive)
                    Modifier.combinedClickable(
                        interactionSource = interaction,
                        indication = null,
                        role = Role.Button,
                        onClick = { onClick?.invoke() },
                        onLongClickLabel = "Receipt options",
                        onLongClick = onLongClick?.let { open ->
                            {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                holding = false
                                open()
                            }
                        },
                    )
                else Modifier
            )
            .heightIn(min = GohoSpacing.rowMinHeight)
            .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.rowVertical),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.thumbToText),
    ) {
        thumbnail()
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    merchant,
                    style = t.rowTitle,
                    color = c.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.size(12.dp))
                when (state) {
                    is ReceiptRowState.Processed -> GohoAmountText(state.amount, state.foreignPrefix)
                    ReceiptRowState.NotProcessed -> GohoAmountText(null, null)
                    ReceiptRowState.Processing -> Box(
                        Modifier
                            .size(52.dp, 12.dp)
                            .clip(GohoShapes.pill)
                            .background(rememberShimmerBrush(c.skeletonBase, c.skeletonShimmer)),
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(dateLabel, style = t.meta, color = c.textTertiary, modifier = Modifier.weight(1f))
                when (state) {
                    ReceiptRowState.Processing -> GohoStatusPill("Reading receipt…", PillTone.Accent, shimmer = true)
                    ReceiptRowState.NotProcessed -> GohoStatusPill("Not processed", PillTone.Attention)
                    is ReceiptRowState.Processed -> Unit
                }
            }
        }
    }
}

@Composable
fun GohoSectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = GohoTheme.type.section,
        color = GohoTheme.colors.textTertiary,
        modifier = modifier.padding(
            start = GohoSpacing.textInsetFromMargin,
            end = GohoSpacing.textInsetFromMargin,
            bottom = GohoSpacing.sectionLabelBottom,
        ),
    )
}

@Composable
fun GohoCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = GohoTheme.colors
    val edge = if (c.isDark) {
        Modifier.clip(GohoShapes.card).background(c.surface).topHighlight(Color.White.copy(alpha = 0.03f))
    } else {
        Modifier
            .shadow(1.dp, GohoShapes.card, clip = false, ambientColor = c.shadow.copy(alpha = 0.4f), spotColor = c.shadow.copy(alpha = 0.4f))
            .clip(GohoShapes.card)
            .background(c.surface)
            .border(1.dp, c.shadow.copy(alpha = 0.05f), GohoShapes.card)
    }
    Column(
        modifier
            .fillMaxWidth()
            .then(edge)
            .padding(vertical = GohoSpacing.cardVerticalPadding),
        content = content,
    )
}

@Composable
fun GohoRowDivider(start: Dp = GohoSpacing.dividerStart) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(start = start)
            .height(1.dp)
            .background(GohoTheme.colors.divider),
    )
}

// ---------- Money ----------

/**
 * The one money formatter for the whole app: always exactly two decimals ("3.50", "1,204.00").
 * Returns null for a missing amount so callers render "—" (never "0.00").
 */
fun formatMoney(amount: BigDecimal?, locale: Locale = Locale.getDefault()): String? {
    if (amount == null) return null
    val nf = NumberFormat.getNumberInstance(locale).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
        roundingMode = RoundingMode.HALF_EVEN
        isGroupingUsed = true
    }
    return nf.format(amount)
}
// Home currency: "$" + formatMoney(x). Foreign: pass "US$" as foreignPrefix and formatMoney(x) as the number.

// ---------- Detail screen pieces ----------

@Composable
fun GohoDetailRow(
    label: String,
    value: String?, // null shows "—"
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val t = GohoTheme.type
    Row(
        modifier
            .fillMaxWidth()
            .height(GohoSpacing.detailRowHeight)
            .padding(horizontal = GohoSpacing.cardPadding),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = t.listRow, color = c.textSecondary, modifier = Modifier.weight(1f))
        if (value == null) Text("—", style = t.listValue, color = c.textTertiary)
        else Text(value, style = t.listValue, color = c.textPrimary)
    }
}

data class ReceiptItemUi(val name: String, val amount: String?) // amount from formatMoney, no symbol

@Composable
fun GohoItemsCard(
    items: List<ReceiptItemUi>,
    total: String?,           // from formatMoney
    totalPrefix: String,      // "$" for home currency, "US$" etc. for foreign
    foreign: Boolean,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val t = GohoTheme.type
    GohoCard(modifier) {
        Column(Modifier.padding(horizontal = GohoSpacing.cardPadding)) {
            items.forEachIndexed { index, item ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 14.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        item.name,
                        style = t.listRow,
                        color = c.textPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (item.amount == null) Text("—", style = t.listValue, color = c.textTertiary)
                    else Text(item.amount, style = t.listValue, color = c.textPrimary, maxLines = 1)
                }
                if (index < items.lastIndex) {
                    Box(Modifier.fillMaxWidth().height(1.dp).background(c.divider))
                }
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(c.textPrimary.copy(alpha = if (c.isDark) 0.10f else 0.12f)),
            )
            Row(
                Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Total", style = t.listValue.copy(fontWeight = FontWeight.SemiBold), color = c.textPrimary, modifier = Modifier.weight(1f))
                val totalStyle = t.rowTitle.copy(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.01).em)
                if (total == null) {
                    Text("—", style = totalStyle, color = c.textTertiary)
                } else {
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = if (foreign) c.textTertiary else c.textPrimary)) { append(totalPrefix) }
                            withStyle(SpanStyle(color = c.textPrimary)) { append(total) }
                        },
                        style = totalStyle,
                    )
                }
            }
        }
    }
}

@Composable
fun GohoPhotoFrame(
    height: Dp,
    modifier: Modifier = Modifier,
    onOpen: (() -> Unit)? = null, // only a loaded details photo opens the viewer
    photo: @Composable BoxScope.() -> Unit,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    Box(
        modifier.fillMaxWidth().height(height)
            .gohoPressTransform { progress }
            .then(if (onOpen != null) Modifier.clickable(
                interactionSource = interaction, indication = null, role = Role.Button,
                onClickLabel = "View receipt photo", onClick = onOpen,
            ).semantics { contentDescription = "View receipt photo" } else Modifier)
            .clip(GohoShapes.card)
            .background(Brush.radialGradient(listOf(c.photoWellCenter, c.photoWellEdge))),
        contentAlignment = Alignment.Center,
        content = photo,
    )
}

/** Close button for the photo viewer. Same look in both themes. */
@Composable
fun GohoPhotoControlButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconSize: Dp = 20.dp,
) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    Box(
        modifier
            .gohoPressTransform { progress }
            .size(44.dp)
            .clip(CircleShape)
            .background(c.photoControl)
            .border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = contentDescription, modifier = Modifier.size(iconSize), tint = Color(0xFFF0EEEB))
    }
}

// Photo viewer: build from references/screens.md section 3. Suggested pieces:
// - Zoom and pan: Modifier.pointerInput { detectTransformGestures(...) } plus
//   detectTapGestures(onTap = toggle controls, onDoubleTap = { offset -> animate to 2.5x at offset }),
//   with scale and offset held in Animatable so springs and the double-tap animation share state.
// - Swipe to close at fit: detectVerticalDragGestures, mapping drag distance to translationY,
//   scale (min 0.86 at 300dp) and background alpha (down to 0.55).
// - Controls: wrap GohoPhotoControlButton in AnimatedVisibility(fadeIn/fadeOut 200ms) driven by the
//   same flag that shows and hides system bars via WindowInsetsControllerCompat.

// ---------- Sheet ----------

/**
 * Floating bottom sheet: inset 8dp, 28dp corners, grabber. Swap its content in place
 * (options -> confirmation) and let animateContentSize handle the height change.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GohoSheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    dismissible: Boolean = true, // false while a delete is in progress
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = GohoTheme.colors
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        confirmValueChange = { dismissible || it != SheetValue.Hidden },
    )
    ModalBottomSheet(
        onDismissRequest = { if (dismissible) onDismissRequest() },
        sheetState = sheetState,
        shape = RectangleShape,
        containerColor = Color.Transparent,
        tonalElevation = 0.dp,
        scrimColor = c.scrim,
        dragHandle = null,
    ) {
        Column(
            modifier
                .navigationBarsPadding()
                .padding(start = 8.dp, end = 8.dp, bottom = 8.dp)
                .fillMaxWidth()
                .shadow(12.dp, GohoShapes.sheet, clip = false, ambientColor = c.shadow.copy(alpha = 0.3f), spotColor = c.shadow.copy(alpha = 0.3f))
                .clip(GohoShapes.sheet)
                .background(c.sheet)
                .border(1.dp, if (c.isDark) Color.White.copy(alpha = 0.05f) else c.shadow.copy(alpha = 0.04f), GohoShapes.sheet)
                .animateContentSize(tween(250)),
        ) {
            Box(
                Modifier
                    .padding(top = 8.dp)
                    .align(Alignment.CenterHorizontally)
                    .size(36.dp, 4.dp)
                    .clip(GohoShapes.pill)
                    .background(c.grabber),
            )
            content()
        }
    }
}

/** Traditional list item in a sheet; destructive tone, for example "Delete receipt". */
@Composable
fun GohoSheetMenuItem(text: String, icon: ImageVector, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(if (pressed) (if (c.isDark) c.surfaceMutedPressed else c.surfacePressed) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.onDangerContainer)
        Text(text, style = GohoTheme.type.rowTitle, color = c.onDangerContainer)
    }
}

// ---------- Receipt options sheet header ----------

/**
 * The row header shared by the options sheet and the delete confirmation (screens.md section 5).
 * Identical in both states; only the content below it changes.
 */
@Composable
fun GohoReceiptSheetHeader(
    store: String?,              // null -> "Unknown receipt"
    price: String?,              // from formatMoney; null when not processed or missing
    pricePrefix: String,         // "$" or "US$"
    foreign: Boolean,
    dateLabel: String,           // "Sun, Sep 27, 2026" or "Today, 8:14 AM"
    notProcessed: Boolean,
    modifier: Modifier = Modifier,
    photo: @Composable BoxScope.() -> Unit, // the receipt image, ContentScale.Crop
) {
    val c = GohoTheme.colors
    val t = GohoTheme.type
    Row(
        modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            Modifier
                .size(56.dp, 68.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(c.surfaceMuted)
                .border(1.dp, c.outline, RoundedCornerShape(10.dp)),
            content = photo,
        )
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                store ?: "Unknown receipt",
                style = t.rowTitle.copy(fontSize = 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.015).em),
                color = c.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (notProcessed) {
                    GohoStatusPill("Not processed", PillTone.Attention)
                } else if (price != null) {
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = if (foreign) c.textTertiary else c.textPrimary)) { append(pricePrefix) }
                            withStyle(SpanStyle(color = c.textPrimary)) { append(price) }
                        },
                        style = t.listValue,
                    )
                }
                Text(dateLabel, style = t.listRow, color = c.textTertiary, maxLines = 1)
            }
        }
    }
}

/** Error line above confirmation buttons; the approved sheet omits the question heading. */
@Composable
fun GohoDeleteError(modifier: Modifier = Modifier) {
    Text(
        "Couldn’t delete this receipt. Try again.",
        style = GohoTheme.type.body,
        color = GohoTheme.colors.onDangerContainer,
        modifier = modifier,
    )
}

// ---------- Status content (empty and error states) ----------

/** Current status content sits directly on the screen background. No receipts supplies receipt-holding Bram.
 * Empty Needs attention supplies calm thumbs-up Bram with "All good" and "Nothing needs your attention right now."
 * Each state uses its transparent illustration unchanged in both themes, with a 4dp gap before its title.
 * Load error supplies gentle shrugging Bram with "A little hiccup" and "We couldn’t load your receipts. Let’s try again."
 * The Receipts header is text-only in every state.
 * For retry, pass announcePolitely = true and reserve both button labels. Disable immediately, keep "Try again"
 * during the 200ms grace period, then use loading = true with accessible text "Trying again…" while pending.
 * ReceiptOverview owns the success crossfade and passes animateEntrance = false on the incoming status content.
 */
@Composable
fun GohoStatusContent(
    title: String,
    text: String,
    modifier: Modifier = Modifier,
    illustration: androidx.compose.ui.graphics.painter.Painter? = null,
    animateEntrance: Boolean = true,
    announcePolitely: Boolean = false,
    action: (@Composable () -> Unit)? = null,
) {
    val c = GohoTheme.colors
    val reducedMotion = rememberReducedMotion()
    val entrance = remember { Animatable(if (reducedMotion || !animateEntrance) 1f else 0f) }
    LaunchedEffect(reducedMotion, animateEntrance) {
        if (reducedMotion || !animateEntrance) entrance.snapTo(1f)
        else entrance.animateTo(1f, tween(GohoMotion.STATUS_ENTER_MILLIS))
    }
    Column(
        modifier
            .fillMaxWidth()
            .graphicsLayer {
                val progress = if (reducedMotion || !animateEntrance) 1f else entrance.value
                alpha = progress
                translationY = GohoMotion.statusEnterTranslation.toPx() * (1f - progress)
            }
            .semantics(mergeDescendants = true) {
                if (announcePolitely) liveRegion = LiveRegionMode.Polite
            }
            .padding(
                start = GohoSpacing.statusCardSide,
                end = GohoSpacing.statusCardSide,
                top = GohoSpacing.statusCardTop,
                bottom =
                    if (action == null) GohoSpacing.statusCardBottom
                    else GohoSpacing.statusCardActionBottom,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (illustration != null) {
            androidx.compose.foundation.Image(
                illustration,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier =
                    Modifier.widthIn(max = GohoSpacing.statusIllustrationWidth)
                        .fillMaxWidth()
                        .aspectRatio(
                            GohoSpacing.statusIllustrationWidth / GohoSpacing.statusIllustrationHeight
                        ),
            )
            Spacer(Modifier.height(GohoSpacing.statusTitleTop))
        }
        Text(
            title,
            style = GohoTheme.type.title.copy(fontSize = 20.sp, lineHeight = 26.sp, letterSpacing = (-0.02).em),
            color = c.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(GohoSpacing.statusBodyTop))
        Text(
            text,
            style = GohoTheme.type.body,
            color = c.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(max = GohoSpacing.statusBodyMaxWidth),
        )
        if (action != null) {
            Spacer(Modifier.height(GohoSpacing.statusActionTop))
            action()
        }
    }
}
