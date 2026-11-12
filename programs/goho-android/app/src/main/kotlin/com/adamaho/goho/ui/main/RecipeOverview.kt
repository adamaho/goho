package com.adamaho.goho.ui.main

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.RecipeSummary
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*

/**
 * Recipes content below the section title, read-only: saved rows open their details through
 * [onRecipeClick], while unfinished and failed link imports are display-only. Needs attention lists
 * failed imports and shows its count as plain text, not the badge.
 */
@Composable
internal fun RecipeOverview(
    state: RecipeListState,
    thumbnails: ThumbnailCache,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    onRecipeClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    menuOpen: Boolean = false,
) {
    val entries =
        remember(state.recipes, state.uploads) { recipeListEntries(state.recipes, state.uploads) }
    val pages = rememberFilterPagerState()
    val allListState = rememberLazyListState()
    val attentionListState = rememberLazyListState()
    FilterPager(
        state = pages,
        total = entries.size,
        attention = entries.count { it.needsAttention },
        showFilters = !state.error && state.hasLoaded,
        swipeEnabled = state.hasLoaded && !state.error && !state.refreshing && !menuOpen,
        error = state.error,
        refreshing = state.refreshing,
        refreshFailed = state.refreshError || state.error,
        refreshEnabled = !menuOpen && !state.loading && (state.hasLoaded || state.error),
        onRefresh = onRefresh,
        refreshLabel = stringResource(R.string.recipes_refresh),
        refreshProgressLabel = stringResource(R.string.recipes_refreshing),
        modifier = modifier,
        attentionBadge = false,
    ) { attentionOnly, error, animateEntrance, pageModifier ->
        RecipeListPage(
            state = state,
            entries =
                remember(entries, attentionOnly) {
                    if (attentionOnly) entries.filter { it.needsAttention } else entries
                },
            attentionOnly = attentionOnly,
            error = error,
            animateEntrance = animateEntrance,
            thumbnails = thumbnails,
            onRecipeClick = onRecipeClick,
            listState = if (attentionOnly) attentionListState else allListState,
            onRetryClick = onRetryClick,
            modifier = pageModifier,
        )
    }
}

@Composable
private fun RecipeListPage(
    state: RecipeListState,
    entries: List<RecipeListEntry>,
    attentionOnly: Boolean,
    error: Boolean,
    animateEntrance: Boolean,
    thumbnails: ThumbnailCache,
    onRecipeClick: (String) -> Unit,
    listState: LazyListState,
    onRetryClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val showLoading = rememberLoadingVisible(state.loading)
    Column(modifier.fillMaxSize()) {
        if (error || (state.hasLoaded && entries.isEmpty())) {
            BoxWithConstraints(
                Modifier.weight(1f).fillMaxWidth().padding(bottom = GohoSpacing.listBottom)
            ) {
                Column(
                    Modifier.fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = maxHeight)
                        .padding(
                            horizontal = GohoSpacing.screenMargin,
                            vertical = GohoSpacing.screenMargin,
                        ),
                    verticalArrangement = Arrangement.Center,
                ) {
                    when {
                        error ->
                            LoadErrorState(
                                description = stringResource(R.string.recipes_load_failed_body),
                                onRetry = { if (state.error && !state.loading) onRetryClick() },
                                isRetrying = state.loading || !state.error,
                                showProgress = state.error && showLoading && !state.refreshing,
                            )
                        attentionOnly -> NoNeedsAttentionState(animateEntrance = animateEntrance)
                        else -> NoRecipesState(animateEntrance = animateEntrance)
                    }
                }
            }
        } else
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().headerFade(GohoTheme.colors.background),
                // Recipes has no section labels, so start the card below the header fade.
                contentPadding =
                    PaddingValues(
                        start = GohoSpacing.screenMargin,
                        top = GohoSpacing.headerFadeHeight,
                        end = GohoSpacing.screenMargin,
                        bottom = GohoSpacing.listBottom,
                    ),
            ) {
                if (!state.hasLoaded && state.loading)
                    item("loading") {
                        SkeletonScope(loading = true) {
                            // The card and its dividers wait for the masks, so no empty card shows.
                            ListCard(
                                Modifier.skeletonContainer()
                                    .loadingSemantics(
                                        true,
                                        stringResource(R.string.recipes_loading),
                                    )
                            ) {
                                repeat(4) { index ->
                                    if (index > 0) ListDivider()
                                    RecipeRow(null, thumbnails)
                                }
                            }
                        }
                    }
                if (entries.isNotEmpty())
                    item("recipes") {
                        ListCard {
                            entries.forEachIndexed { index, entry ->
                                key(entry.key) {
                                    if (index > 0) ListDivider()
                                    RecipeRow(entry, thumbnails, onRecipeClick)
                                }
                            }
                        }
                    }
            }
    }
}

/**
 * Recipes row: a 40dp square photo or placeholder, the one-line title, then the “25 min ·
 * examplekitchen.com” meta line, or an import's upload tag. Missing parts of the meta line are left
 * out, and the line too when both are. Only saved recipes take a tap; imports are display-only. A
 * null [entry] keeps the same layout for skeleton loading.
 */
@Composable
private fun RecipeRow(
    entry: RecipeListEntry?,
    thumbnails: ThumbnailCache,
    onClick: ((String) -> Unit)? = null,
) {
    val c = GohoTheme.colors
    val recipe = (entry as? RecipeListEntry.Saved)?.recipe
    val import = entry as? RecipeListEntry.Import
    val interaction = remember { MutableInteractionSource() }
    val clickable =
        if (recipe != null && onClick != null)
            Modifier.clickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClick = { onClick(recipe.id) },
                )
                .listRowPressFeedback(interaction, held = false)
        else Modifier
    Row(
        Modifier.fillMaxWidth()
            .then(clickable)
            .heightIn(min = GohoSpacing.rowMinHeight)
            .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.rowVertical)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(GohoSpacing.thumbToText),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RecipeThumbnail(entry, thumbnails)
        Column(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(GohoSpacing.lineGap),
        ) {
            Text(
                when {
                    recipe != null -> recipe.title
                    import != null -> recipeDomain(import.url)
                    else -> ""
                },
                modifier = Modifier.fillMaxWidth().skeleton(fraction = 0.8f),
                style = GohoTheme.type.rowTitle,
                color = c.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            when {
                import != null ->
                    RecipeUploadTag(
                        processing = !import.failed,
                        failed = recipeFailureLabel(import.failure),
                        modifier = Modifier.widthIn(max = GohoSpacing.tagMaxWidth),
                    )
                else ->
                    recipeMeta(recipe)?.let {
                        Text(
                            it,
                            modifier = Modifier.fillMaxWidth().skeleton(fraction = 0.55f),
                            style = GohoTheme.type.meta,
                            color = c.textTertiary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
            }
        }
    }
}

/** Total time and the source's domain, either alone, or null when neither is known. */
@Composable
private fun recipeMeta(recipe: RecipeSummary?): String? {
    if (recipe == null) return ""
    val resources = LocalResources.current
    val time = recipe.totalTimeSeconds?.let { recipeDuration(it, resources) }
    val domain = recipe.source?.url?.let(::recipeDomain)
    return if (time != null && domain != null) stringResource(R.string.recipe_meta, time, domain)
    else time ?: domain
}

/**
 * A saved recipe's photo once visible, or the neutral utensils placeholder without one or when it
 * fails to load (the plain fill stands in while it loads); imports show a lavender link while
 * reading and an orange one when failed. Decorative: the row text and tag describe the state.
 */
@Composable
private fun RecipeThumbnail(entry: RecipeListEntry?, thumbnails: ThumbnailCache) {
    val c = GohoTheme.colors
    val shape = GohoShapes.thumb
    val recipeId = (entry as? RecipeListEntry.Saved)?.recipe?.takeIf { it.hasImage }?.id
    val import = entry as? RecipeListEntry.Import
    var visible by remember { mutableStateOf(false) }
    // A photo still loading keeps the plain fill rather than flashing the utensils.
    var loading by remember(recipeId) { mutableStateOf(recipeId != null) }
    val bitmap by
        produceState<Bitmap?>(null, recipeId, visible, thumbnails) {
            // Keep a loaded photo while off screen so it doesn't flash the placeholder on return.
            if (recipeId == null) value = null
            else if (visible) value = thumbnails.get(recipeId).also { loading = false }
        }
    val image = bitmap
    Box(
        Modifier.onGloballyPositioned { visible = !it.boundsInWindow().isEmpty }
            .size(GohoSpacing.recipeThumb)
            .clip(shape)
            .skeleton(block = true)
            .background(
                when {
                    import == null -> c.surfaceMuted
                    import.failed -> c.attentionContainer
                    else -> c.accentContainer
                }
            )
            .border(GohoSpacing.hairline, c.outline, shape),
        contentAlignment = Alignment.Center,
    ) {
        if (image != null)
            Image(
                image.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        else if (entry != null && !loading)
            Icon(
                painterResource(
                    if (import != null) R.drawable.ic_link else R.drawable.ic_tag_meals
                ),
                contentDescription = null,
                tint =
                    when {
                        import == null -> c.textSecondary
                        import.failed -> c.attention
                        else -> c.onAccentContainer
                    },
                modifier = Modifier.size(GohoSpacing.coverIcon),
            )
    }
}
