// Goho UI primitives. Reference implementation from the design handoff; not compiled
// against the project, so fix any API drift for the project's Compose version.
package com.goho.ui.components // TODO: match the app's package

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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
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
import androidx.compose.ui.unit.lerp as lerpDp

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
        targetValue = if (pressed) 1f else 0f,
        animationSpec = when {
            pressed -> GohoMotion.pressIn
            reduced -> GohoMotion.pressOutReduced
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

// ---------- Buttons ----------

@Composable
private fun GohoButtonBase(
    onClick: () -> Unit,
    modifier: Modifier,
    enabled: Boolean,
    minHeight: Dp,
    shape: Shape,
    restElevation: Dp,
    shadowColor: Color,
    fill: (Float) -> Brush,
    highlightAlpha: (Float) -> Float,
    contentPadding: PaddingValues,
    content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    val p = progress.coerceIn(0f, 1f)
    Row(
        modifier = modifier
            .gohoPressTransform { progress }
            .alpha(if (enabled) 1f else 0.4f)
            .shadow(lerpDp(restElevation, 0.5.dp, p), shape, clip = false, ambientColor = shadowColor, spotColor = shadowColor)
            .clip(shape)
            .background(fill(p))
            .topHighlight(Color.White.copy(alpha = highlightAlpha(p)))
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
        restElevation = 3.dp,
        shadowColor = c.accentShadow,
        fill = { p ->
            Brush.verticalGradient(listOf(lerpColor(c.accentTop, c.accent, p), lerpColor(c.accent, c.accentPressed, p)))
        },
        highlightAlpha = { p -> c.highlightAlpha * (1f - 0.45f * p) },
        contentPadding = PaddingValues(start = 18.dp, end = 22.dp),
    ) {
        Icon(scanIcon, contentDescription = null, modifier = Modifier.size(22.dp), tint = c.onAccent)
        Text("Scan", style = GohoTheme.type.button, color = c.onAccent)
    }
}

@Composable
fun GohoPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    val c = GohoTheme.colors
    GohoButtonBase(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        minHeight = 52.dp,
        shape = GohoShapes.button,
        restElevation = 2.dp,
        shadowColor = c.accentShadow,
        fill = { p ->
            Brush.verticalGradient(listOf(lerpColor(c.accentTop, c.accent, p), lerpColor(c.accent, c.accentPressed, p)))
        },
        highlightAlpha = { p -> c.highlightAlpha * (1f - 0.45f * p) },
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = c.onAccent)
        Text(text, style = GohoTheme.type.button, color = c.onAccent)
    }
}

@Composable
fun GohoSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    val c = GohoTheme.colors
    GohoButtonBase(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        minHeight = 52.dp,
        shape = GohoShapes.button,
        restElevation = if (c.isDark) 1.dp else 0.dp, // flat in light
        shadowColor = c.shadow,
        fill = { p -> SolidColor(lerpColor(c.buttonSecondary, c.buttonSecondaryPressed, p)) },
        highlightAlpha = { p -> if (c.isDark) 0.06f * (1f - p) else 0f },
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = c.textPrimary)
        Text(text, style = GohoTheme.type.buttonSecondary, color = c.textPrimary)
    }
}

@Composable
fun GohoDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    val c = GohoTheme.colors
    GohoButtonBase(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        minHeight = 52.dp,
        shape = GohoShapes.button,
        restElevation = 2.dp,
        shadowColor = c.dangerShadow,
        fill = { p ->
            Brush.verticalGradient(listOf(lerpColor(c.dangerTop, c.danger, p), lerpColor(c.danger, c.dangerPressed, p)))
        },
        highlightAlpha = { p -> 0.18f * (1f - 0.45f * p) },
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        if (icon != null) Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = c.onDanger)
        Text(text, style = GohoTheme.type.button, color = c.onDanger)
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
                Text("Total", style = t.listValue.copy(fontWeight = FontWeight.Bold), color = c.textPrimary, modifier = Modifier.weight(1f))
                val totalStyle = t.rowTitle.copy(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.01).em)
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

/** Destructive sheet row, for example "Delete receipt". */
@Composable
fun GohoSheetAction(text: String, icon: ImageVector, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier
            .fillMaxWidth()
            .height(60.dp)
            .background(if (pressed) (if (c.isDark) c.surfaceMutedPressed else c.surfacePressed) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(c.dangerContainer),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = c.onDangerContainer) }
        Text(text, style = GohoTheme.type.rowTitle, color = c.onDangerContainer)
    }
}
