package com.adamaho.goho.ui.main

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.ResolvedTextDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Recipe
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.text.NumberFormat
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * Read-only recipe details for [recipeId], loaded on entry and on Retry. The edge-to-edge hero
 * photo and the page sheet over it scroll together under a fixed Back and a fixed status-bar strip
 * of the theme background at 80%. A recipe that's gone shows its own message without Retry and
 * calls [onMissing]. The Source row opens the page through [onOpenSource] only for http and https
 * addresses. There is no overflow menu until recipes can be deleted.
 */
@Composable
internal fun RecipeDetailScreen(
    recipeId: String,
    loadRecipe: suspend (String) -> RecipeLoad,
    loadRecipeImage: suspend (String) -> ByteArray?,
    onBack: () -> Unit,
    onOpenSource: (String) -> Unit,
    onMissing: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var reloadKey by remember(recipeId) { mutableIntStateOf(0) }
    // Null while loading.
    var result by remember(recipeId) { mutableStateOf<RecipeLoad?>(null) }
    LaunchedEffect(recipeId, reloadKey) {
        result = null
        val loaded = loadRecipe(recipeId)
        result = loaded
        if (loaded == RecipeLoad.Missing) onMissing()
    }
    val recipe = (result as? RecipeLoad.Loaded)?.recipe
    val hasImage = recipe?.hasImage == true
    var image by remember(recipeId) { mutableStateOf<ImageBitmap?>(null) }
    var imageLoading by remember(recipeId) { mutableStateOf(false) }
    LaunchedEffect(recipeId, hasImage) {
        if (!hasImage || image != null) return@LaunchedEffect
        imageLoading = true
        try {
            image = loadRecipeImage(recipeId)?.let { decodePhoto(it) }
        } finally {
            imageLoading = false
        }
    }

    val c = GohoTheme.colors
    Box(modifier.fillMaxSize().background(c.background)) {
        when (result) {
            RecipeLoad.Failed,
            RecipeLoad.Missing ->
                Column(
                    Modifier.fillMaxSize()
                        .safeDrawingPadding()
                        .padding(top = GohoSpacing.detailTopBarHeight)
                        .padding(horizontal = GohoSpacing.textInset),
                    verticalArrangement =
                        Arrangement.spacedBy(GohoSpacing.contentGap, Alignment.CenterVertically),
                ) {
                    val missing = result == RecipeLoad.Missing
                    Text(
                        stringResource(
                            if (missing) R.string.recipe_detail_missing
                            else R.string.recipe_detail_load_failed
                        ),
                        style = GohoTheme.type.meta,
                        color = c.textSecondary,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                    if (!missing)
                        ActionButton(
                            stringResource(R.string.recipe_detail_retry),
                            { reloadKey++ },
                            variant = 2,
                            color = ButtonColor.Grey,
                        )
                }
            else ->
                RecipeContent(
                    recipe = recipe,
                    image = image,
                    // Utensils only once there's no photo to wait for.
                    showHeroIcon =
                        recipe != null && (!hasImage || (!imageLoading && image == null)),
                    onOpenSource = onOpenSource,
                )
        }
        // A fixed strip of the theme background under the status bar keeps its icons legible over
        // any photo, above the scrolling page and below Back.
        Box(
            Modifier.zIndex(1f)
                .fillMaxWidth()
                .windowInsetsTopHeight(WindowInsets.statusBars)
                .background(c.background.copy(alpha = GohoMotion.RECIPE_STATUS_BAR_ALPHA))
        )
        // Back floats over the hero at the top bar position while the page scrolls under it.
        Box(
            Modifier.zIndex(2f)
                .windowInsetsPadding(
                    WindowInsets.safeDrawing.only(
                        WindowInsetsSides.Top + WindowInsetsSides.Horizontal
                    )
                )
                .heightIn(min = GohoSpacing.detailTopBarHeight)
                .padding(horizontal = GohoSpacing.screenMargin),
            contentAlignment = Alignment.CenterStart,
        ) {
            ReceiptBackButton(onBack)
        }
    }
}

/** The loaded recipe, or skeleton masks over the same layout while [recipe] is null. */
@Composable
private fun RecipeContent(
    recipe: Recipe?,
    image: ImageBitmap?,
    showHeroIcon: Boolean,
    onOpenSource: (String) -> Unit,
) {
    val c = GohoTheme.colors
    val resources = LocalResources.current
    val config = LocalConfiguration.current
    val locale = config.locales[0]
    val stacked = config.fontScale >= 1.3f || config.screenWidthDp < GohoSpacing.compactWidth.value
    val loading = recipe == null
    val sides =
        Modifier.windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal))
    val bottom =
        WindowInsets.safeDrawing
            .only(WindowInsetsSides.Bottom)
            .asPaddingValues()
            .calculateBottomPadding()
    val ingredients =
        remember(recipe, resources) { recipe?.ingredients?.map { ingredientLine(it, resources) } }
    val steps =
        remember(recipe, resources) {
            recipe?.let { saved ->
                val byId = saved.ingredients.associateBy { it.id }
                saved.steps.map { stepParts(it, byId, resources) }
            }
        }
    val added =
        remember(recipe?.createdAt, locale) {
            recipe
                ?.createdAt
                ?.let(::uploadInstant)
                ?.atZone(ZoneId.systemDefault())
                ?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale))
        }
    val source = recipe?.source?.url
    val total = recipe?.totalTimeSeconds?.let { recipeDuration(it, resources) }
    SkeletonScope(loading) {
        LazyColumn(
            Modifier.fillMaxSize()
                .loadingSemantics(loading, stringResource(R.string.recipe_detail_loading)),
            contentPadding = PaddingValues(bottom = bottom + GohoSpacing.detailBottom),
        ) {
            item("hero") { RecipeHero(image, showHeroIcon) }
            item("title") {
                // The page sheet slides over the bottom of the hero and scrolls with it.
                Column(
                    Modifier.fillMaxWidth()
                        .background(c.background, GohoShapes.recipeSheet)
                        .then(sides)
                        .padding(horizontal = GohoSpacing.screenMargin)
                        .padding(top = GohoSpacing.recipeTitleTop)
                ) {
                    Text(
                        recipe?.title.orEmpty(),
                        style = GohoTheme.type.recipeTitle,
                        color = c.textPrimary,
                        modifier =
                            Modifier.skeleton(GohoSpacing.skeletonHeroWidth).semantics {
                                heading()
                            },
                    )
                    if (loading || total != null)
                        Column(
                            Modifier.padding(top = GohoSpacing.recipeStatTop).semantics(
                                mergeDescendants = true
                            ) {}
                        ) {
                            Text(
                                total.orEmpty(),
                                style = GohoTheme.type.recipeStat,
                                color = c.textPrimary,
                                modifier = Modifier.skeleton(GohoSpacing.skeletonWidth),
                            )
                            Text(
                                stringResource(R.string.recipe_total),
                                style = GohoTheme.type.recipeStatLabel,
                                color = c.textTertiary,
                                modifier = Modifier.skeleton(),
                            )
                        }
                }
            }
            if (ingredients == null || ingredients.isNotEmpty()) {
                item("ingredients") {
                    RecipeHeading(
                        stringResource(R.string.recipe_ingredients),
                        GohoSpacing.sectionTop,
                        sides,
                    )
                }
                if (ingredients == null)
                    items(4, key = { "ingredient-loading-$it" }) { index ->
                        IngredientRow(null, sides.ingredientPadding(index))
                    }
                else
                    itemsIndexed(ingredients) { index, line ->
                        IngredientRow(line, sides.ingredientPadding(index))
                    }
            }
            if (!steps.isNullOrEmpty()) {
                item("steps") {
                    RecipeHeading(
                        stringResource(R.string.recipe_steps),
                        GohoSpacing.recipeSectionTop,
                        sides,
                    )
                }
                itemsIndexed(steps) { index, parts ->
                    StepRow(
                        NumberFormat.getIntegerInstance(locale).format(index + 1),
                        parts,
                        sides
                            .padding(horizontal = GohoSpacing.textInset)
                            .then(
                                if (index > 0) Modifier.padding(top = GohoSpacing.stepGap)
                                else Modifier
                            ),
                    )
                }
            }
            if (source != null || added != null)
                item("details") {
                    RecipeHeading(
                        stringResource(R.string.recipe_details),
                        GohoSpacing.recipeSectionTop,
                        sides,
                    )
                    ListCard(sides.padding(horizontal = GohoSpacing.screenMargin)) {
                        if (source != null) SourceRow(source, stacked, onOpenSource)
                        if (source != null && added != null) ReceiptDetailDivider()
                        if (added != null)
                            ReceiptDetailRow(stringResource(R.string.recipe_added), stacked) {
                                Text(
                                    added,
                                    style = GohoTheme.type.listValue,
                                    color = c.textPrimary,
                                    textAlign = if (stacked) TextAlign.Start else TextAlign.End,
                                )
                            }
                    }
                }
        }
    }
}

private fun Modifier.ingredientPadding(index: Int): Modifier =
    padding(horizontal = GohoSpacing.textInset)
        .then(if (index > 0) Modifier.padding(top = GohoSpacing.ingredientGap) else Modifier)

/**
 * The edge-to-edge photo, cropped to fill, or the quiet utensils block without one. It lays out
 * [GohoSpacing.recipeSheetOverlap] shorter than it draws, so the page sheet covers its bottom.
 */
@Composable
private fun RecipeHero(image: ImageBitmap?, showIcon: Boolean) {
    val c = GohoTheme.colors
    Box(
        Modifier.fillMaxWidth()
            .height(GohoSpacing.recipeHeroHeight - GohoSpacing.recipeSheetOverlap)
    ) {
        Box(
            Modifier.fillMaxWidth()
                .wrapContentHeight(Alignment.Top, unbounded = true)
                .requiredHeight(GohoSpacing.recipeHeroHeight)
                .skeleton(block = true)
                .background(c.surfaceMuted),
            contentAlignment = Alignment.Center,
        ) {
            if (image != null)
                Image(
                    image,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.matchParentSize(),
                )
            else if (showIcon)
                Icon(
                    painterResource(R.drawable.ic_tag_meals),
                    contentDescription = null,
                    tint = c.accent,
                    modifier = Modifier.size(GohoSpacing.recipeHeroIcon),
                )
        }
    }
}

@Composable
private fun RecipeHeading(text: String, top: Dp, modifier: Modifier = Modifier) {
    Text(
        text,
        style = GohoTheme.type.recipeSection,
        color = GohoTheme.colors.textPrimary,
        modifier =
            modifier
                .padding(
                    start = GohoSpacing.textInset,
                    top = top,
                    end = GohoSpacing.textInset,
                    bottom = GohoSpacing.recipeSectionBottom,
                )
                .skeleton(GohoSpacing.skeletonTitleWidth)
                .semantics { heading() },
    )
}

/**
 * A bulleted ingredient: the bold amount when there is one, then the API's full name. Long lines
 * wrap under the text, not the dot. A null [line] keeps the layout for skeleton loading.
 */
@Composable
private fun IngredientRow(line: IngredientLine?, modifier: Modifier) {
    val c = GohoTheme.colors
    val style = GohoTheme.type.ingredient
    val lineHeight = with(LocalDensity.current) { style.lineHeight.toDp() }
    val resources = LocalResources.current
    val text =
        remember(line, resources) {
            when {
                line == null -> AnnotatedString("")
                line.amount == null -> AnnotatedString(line.name)
                else -> {
                    val full =
                        resources.getString(
                            R.string.recipe_ingredient_amount,
                            line.amount,
                            line.name,
                        )
                    val start = full.indexOf(line.amount)
                    buildAnnotatedString {
                        append(full)
                        if (start >= 0)
                            addStyle(
                                SpanStyle(fontWeight = FontWeight.SemiBold),
                                start,
                                start + line.amount.length,
                            )
                    }
                }
            }
        }
    Row(modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        Box(
            Modifier.padding(
                    top = ((lineHeight - GohoSpacing.ingredientDot) / 2).coerceAtLeast(0.dp)
                )
                .size(GohoSpacing.ingredientDot)
                .skeleton(block = true)
                .background(c.accent, GohoShapes.pill)
        )
        Spacer(Modifier.width(GohoSpacing.ingredientDotGap))
        Text(
            text,
            style = style,
            color = c.textPrimary,
            modifier = Modifier.weight(1f).skeleton(fraction = 0.6f),
        )
    }
}

@Composable
private fun StepRow(number: String, parts: List<StepPart>, modifier: Modifier) {
    val c = GohoTheme.colors
    val lineHeight = with(LocalDensity.current) { GohoTheme.type.step.lineHeight.toDp() }
    Row(modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        Box(
            Modifier.padding(top = ((lineHeight - GohoSpacing.stepNumber) / 2).coerceAtLeast(0.dp))
                .defaultMinSize(GohoSpacing.stepNumber, GohoSpacing.stepNumber)
                .background(c.accentContainer, GohoShapes.pill),
            contentAlignment = Alignment.Center,
        ) {
            Text(number, style = GohoTheme.type.stepNumber, color = c.onAccentContainer)
        }
        Spacer(Modifier.width(GohoSpacing.stepNumberGap))
        StepText(parts, Modifier.weight(1f))
    }
}

private const val MARK_PAD = "markPad"

/**
 * Narrow no-break space: the line breaker may break before a mark's leading pad and after its
 * trailing one, but never between a pad and the mark, so each pad stays with its mark.
 */
private const val MARK_PAD_TEXT = "\u202F"

/**
 * One step paragraph as a single text, so it wraps, reads and scales as one: plain wording as
 * written, and each ingredient mark in Geist Mono on a rounded `accentContainer` fill. A 4dp
 * placeholder before and after each mark reserves its horizontal padding in the layout. The fill is
 * drawn behind each line the mark occupies, from this text's own layout; where a mark wraps, the
 * fill extends the same padding past the text at the break.
 */
@Composable
private fun StepText(parts: List<StepPart>, modifier: Modifier = Modifier) {
    val c = GohoTheme.colors
    val style = GohoTheme.type.step
    val mark = GohoTheme.type.ingredientMark
    val markColor = c.onAccentContainer
    val (text, marks) =
        remember(parts, mark, markColor) { stepText(parts, mark.copy(color = markColor)) }
    val pad = with(LocalDensity.current) { GohoSpacing.markHorizontal.toSp() }
    val inlineContent =
        remember(pad) {
            mapOf(
                MARK_PAD to
                    InlineTextContent(Placeholder(pad, pad, PlaceholderVerticalAlign.TextCenter)) {}
            )
        }
    // The mark font's own ascent and descent at the current size, for the fill's height.
    val measurer = rememberTextMeasurer(cacheSize = 1)
    val markMetrics =
        remember(style, mark, measurer) {
            val measured =
                measurer.measure(
                    "0",
                    style.copy(
                        fontFamily = mark.fontFamily,
                        fontWeight = mark.fontWeight,
                        fontSize = style.fontSize * mark.fontSize.value,
                        lineHeight = TextUnit.Unspecified,
                    ),
                )
            measured.firstBaseline to measured.size.height - measured.firstBaseline
        }
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    Text(
        text,
        modifier =
            modifier.drawBehind {
                layout?.let {
                    drawMarks(it, marks, markMetrics.first, markMetrics.second, c.accentContainer)
                }
            },
        style = style,
        color = c.textPrimary,
        inlineContent = inlineContent,
        onTextLayout = { layout = it },
    )
}

/** The paragraph text and each mark's range, including its two pads. */
private fun stepText(
    parts: List<StepPart>,
    mark: SpanStyle,
): Pair<AnnotatedString, List<IntRange>> {
    val ranges = mutableListOf<IntRange>()
    val text = buildAnnotatedString {
        parts.forEach { part ->
            when (part) {
                is StepPart.Plain -> append(part.text)
                is StepPart.Mark -> {
                    val start = length
                    appendInlineContent(MARK_PAD, MARK_PAD_TEXT)
                    withStyle(mark) { append(part.text) }
                    appendInlineContent(MARK_PAD, MARK_PAD_TEXT)
                    ranges += start until length
                }
            }
        }
    }
    return text to ranges
}

private fun DrawScope.drawMarks(
    layout: TextLayoutResult,
    marks: List<IntRange>,
    ascent: Float,
    descent: Float,
    color: Color,
) {
    val padX = GohoSpacing.markHorizontal.toPx()
    val padY = GohoSpacing.markVertical.toPx()
    val radius = CornerRadius(GohoSpacing.markRadius.toPx())
    marks.forEach { range ->
        val firstLine = layout.getLineForOffset(range.first)
        val lastLine = layout.getLineForOffset(range.last)
        for (line in firstLine..lastLine) {
            val start = maxOf(range.first, layout.getLineStart(line))
            val end = minOf(range.last + 1, layout.getLineEnd(line, visibleEnd = true))
            if (end <= start) continue
            val first = layout.getBoundingBox(start)
            val last = layout.getBoundingBox(end - 1)
            var left = minOf(first.left, last.left)
            var right = maxOf(first.right, last.right)
            // Only the mark's own ends have a reserved pad; a wrapped edge pads past the text.
            val rtl = layout.getParagraphDirection(start) == ResolvedTextDirection.Rtl
            if (line > firstLine) if (rtl) right += padX else left -= padX
            if (line < lastLine) if (rtl) left -= padX else right += padX
            val baseline = layout.getLineBaseline(line)
            drawRoundRect(
                color,
                topLeft = Offset(left, baseline - ascent - padY),
                size = Size(right - left, ascent + descent + padY * 2),
                cornerRadius = radius,
            )
        }
    }
}

/**
 * The Source row: the page address without its scheme on one line, then the external-link glyph. An
 * http or https address opens the page and is announced as “Open recipe page, {domain}”.
 */
@Composable
private fun SourceRow(url: String, stacked: Boolean, onOpen: (String) -> Unit) {
    val c = GohoTheme.colors
    val openable = remember(url) { recipePageUrl(url) != null }
    val label = stringResource(R.string.recipe_source_open, recipeDomain(url))
    val interaction = remember { MutableInteractionSource() }
    Box(
        if (openable)
            Modifier.clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClick = { onOpen(url) },
                )
                .listRowPressFeedback(interaction, held = false)
                .semantics { contentDescription = label }
        else Modifier
    ) {
        Box(if (openable) Modifier.clearAndSetSemantics {} else Modifier) {
            ReceiptDetailRow(stringResource(R.string.recipe_source), stacked) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(GohoSpacing.textActionIconGap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        recipeAddress(url),
                        modifier = Modifier.weight(1f, fill = false),
                        style = GohoTheme.type.listValue,
                        color = c.onAccentContainer,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (openable)
                        Icon(
                            painterResource(R.drawable.ic_external_link),
                            contentDescription = null,
                            tint = c.onAccentContainer,
                            modifier = Modifier.size(GohoSpacing.sourceIcon),
                        )
                }
            }
        }
    }
}
