package com.adamaho.goho.ui.main

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
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
import kotlinx.coroutines.delay

/**
 * Recipes content below the section title. Saved rows open their details through [onRecipeClick] on
 * a tap and their options sheet on a hold; failed imports open theirs on a tap or hold.
 * [deleteEntry] returns whether the held recipe's or import's deletion was accepted. Links still
 * being sent ([adding]) lead All, and they and unfinished imports are display-only. Needs attention
 * lists failed imports and shows its count as plain text, not the badge. [reveal] shows All at the
 * top once, as after Add recipe, then calls [onRevealed].
 */
@Composable
internal fun RecipeOverview(
    state: RecipeListState,
    adding: List<RecipeListEntry.Adding>,
    thumbnails: ThumbnailCache,
    onRetryClick: () -> Unit,
    onRefresh: () -> Unit,
    onRecipeClick: (String) -> Unit,
    deleteEntry: suspend (RecipeListEntry) -> Boolean,
    modifier: Modifier = Modifier,
    menuOpen: Boolean = false,
    reveal: Boolean = false,
    onRevealed: () -> Unit = {},
) {
    val entries =
        remember(adding, state.recipes, state.uploads) {
            adding + recipeListEntries(state.recipes, state.uploads)
        }
    val pages = rememberFilterPagerState()
    val allListState = rememberLazyListState()
    val attentionListState = rememberLazyListState()
    LaunchedEffect(reveal) {
        if (!reveal) return@LaunchedEffect
        // The new link leads All, so showing the top of All shows it; later refreshes keep the
        // scroll position.
        pages.select(0, animate = false)
        allListState.scrollToItem(0)
        onRevealed()
    }
    // The held row's snapshot, so refreshes and its own deletion never change the open sheet.
    var optionsEntry by remember { mutableStateOf<RecipeListEntry?>(null) }
    val optionsKey = optionsEntry?.key
    val rows =
        remember(thumbnails, onRecipeClick, optionsKey) {
            RecipeRowContext(
                thumbnails = thumbnails,
                onRecipeClick = onRecipeClick,
                onOptions = { optionsEntry = it },
                optionsKey = optionsKey,
            )
        }
    FilterPager(
        state = pages,
        total = entries.size,
        attention = entries.count { it.needsAttention },
        showFilters = !state.error && state.hasLoaded,
        swipeEnabled =
            state.hasLoaded &&
                !state.error &&
                !state.refreshing &&
                optionsEntry == null &&
                !menuOpen,
        error = state.error,
        refreshing = state.refreshing,
        refreshFailed = state.refreshError || state.error,
        refreshEnabled =
            !menuOpen && optionsEntry == null && !state.loading && (state.hasLoaded || state.error),
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
            rows = rows,
            listState = if (attentionOnly) attentionListState else allListState,
            onRetryClick = onRetryClick,
            modifier = pageModifier,
        )
    }
    optionsEntry?.let { entry ->
        key(entry.key) {
            RecipeOptions(
                entry = entry,
                thumbnails = thumbnails,
                onDelete = { deleteEntry(entry) },
                onDismiss = { optionsEntry = null },
            )
        }
    }
}

/** What every Recipes row shares. */
private data class RecipeRowContext(
    val thumbnails: ThumbnailCache,
    val onRecipeClick: (String) -> Unit,
    val onOptions: (RecipeListEntry) -> Unit,
    val optionsKey: String?,
)

/**
 * One page. Links being sent show at once, even before the first listing arrives or after it fails:
 * their card leads, above the loading rows or the load error, which then sits in the list rather
 * than centred.
 */
@Composable
private fun RecipeListPage(
    state: RecipeListState,
    entries: List<RecipeListEntry>,
    attentionOnly: Boolean,
    error: Boolean,
    animateEntrance: Boolean,
    rows: RecipeRowContext,
    listState: LazyListState,
    onRetryClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val showLoading = rememberLoadingVisible(state.loading)
    val displayed =
        rememberRemovingEntries(
            entries,
            RecipeListEntry::key,
            resetKey = attentionOnly,
            // A link's import replaces its row in place, and a refused link has its snackbar.
            fold = { it !is RecipeListEntry.Adding },
        )
    val loadError: @Composable () -> Unit = {
        LoadErrorState(
            description = stringResource(R.string.recipes_load_failed_body),
            onRetry = { if (state.error && !state.loading) onRetryClick() },
            isRetrying = state.loading || !state.error,
            showProgress = state.error && showLoading && !state.refreshing,
        )
    }
    Column(modifier.fillMaxSize()) {
        if (displayed.isEmpty() && (error || state.hasLoaded)) {
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
                        error -> loadError()
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
                if (displayed.isNotEmpty())
                    item("recipes") { RecipeListCard(entries, displayed, rows) }
                if (!state.hasLoaded && state.loading && !error)
                    item("loading") {
                        SkeletonScope(loading = true) {
                            // The card and its dividers wait for the masks, so no empty card shows.
                            ListCard(
                                Modifier.then(
                                        if (displayed.isNotEmpty())
                                            Modifier.padding(top = GohoSpacing.contentGap)
                                        else Modifier
                                    )
                                    .skeletonContainer()
                                    .loadingSemantics(
                                        true,
                                        stringResource(R.string.recipes_loading),
                                    )
                            ) {
                                repeat(4) { index ->
                                    if (index > 0) ListDivider()
                                    RecipeRow(null, rows)
                                }
                            }
                        }
                    }
                if (error)
                    item("error") {
                        Box(Modifier.padding(vertical = GohoSpacing.screenMargin)) { loadError() }
                    }
            }
    }
}

/**
 * One card of [displayed] rows: those no longer in [entries] fold out and can't be opened, and the
 * card itself folds away with its last row, as on Books.
 */
@Composable
private fun RecipeListCard(
    entries: List<RecipeListEntry>,
    displayed: List<RecipeListEntry>,
    rows: RecipeRowContext,
) {
    val reduced = rememberReducedMotion()
    val removalDuration = if (reduced) 0 else GohoMotion.SHEET_CONTENT_MILLIS
    val removal =
        fadeOut(tween(removalDuration)) +
            shrinkVertically(tween(removalDuration), shrinkTowards = Alignment.Top)
    val visibleKeys = entries.mapTo(HashSet()) { it.key }
    AnimatedVisibility(entries.isNotEmpty(), enter = EnterTransition.None, exit = removal) {
        ListCard {
            displayed.forEachIndexed { index, entry ->
                key(entry.key) {
                    val visible = entry.key in visibleKeys
                    AnimatedVisibility(visible, enter = EnterTransition.None, exit = removal) {
                        Column {
                            RecipeRow(
                                entry,
                                rows,
                                // A row folding away can't be opened again.
                                active = visible,
                            )
                            if (displayed.drop(index + 1).any { it.key in visibleKeys })
                                ListDivider()
                        }
                    }
                }
            }
        }
    }
}

/**
 * Recipes row around [RecipeEntrySummary]. Saved recipes open their details on a tap and, on a
 * hold, their options sheet; failed imports open theirs on a tap or hold, with the shared row press
 * and hold feedback. Unfinished imports, links being sent and skeleton rows take no input. Focus
 * returns to the row when its options sheet closes, unless the row is leaving.
 */
@Composable
private fun RecipeRow(entry: RecipeListEntry?, rows: RecipeRowContext, active: Boolean = false) {
    val recipe = (entry as? RecipeListEntry.Saved)?.recipe
    val failedImport = entry?.needsAttention == true
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    var held by remember { mutableStateOf(false) }
    LaunchedEffect(pressed) {
        held = false
        if (pressed) {
            delay(GohoMotion.HOLD_DELAY_MILLIS)
            held = true
        }
    }
    val focus = remember { FocusRequester() }
    val optionsOpen = entry != null && entry.key == rows.optionsKey
    var wasOpen by remember { mutableStateOf(false) }
    LaunchedEffect(optionsOpen) {
        if (wasOpen && !optionsOpen && active) focus.requestFocus()
        wasOpen = optionsOpen
    }
    val open: (() -> Unit)? =
        when {
            !active || entry == null -> null
            recipe != null -> { ->
                rows.onRecipeClick(recipe.id)
            }
            failedImport -> { ->
                rows.onOptions(entry)
            }
            else -> null
        }
    val clickable =
        if (entry != null && open != null)
            Modifier.focusRequester(focus)
                .combinedClickable(
                    interactionSource = interaction,
                    indication = null,
                    role = Role.Button,
                    onClick = open,
                    onLongClickLabel =
                        stringResource(
                            if (failedImport) R.string.recipe_import_options
                            else R.string.recipe_options
                        ),
                    // combinedClickable supplies exactly one platform long-press haptic.
                    onLongClick = {
                        held = false
                        rows.onOptions(entry)
                    },
                )
                .listRowPressFeedback(interaction, held)
        else Modifier
    RecipeEntrySummary(
        entry,
        rows.thumbnails,
        Modifier.fillMaxWidth()
            .then(clickable)
            .heightIn(min = GohoSpacing.rowMinHeight)
            .padding(horizontal = GohoSpacing.cardPadding, vertical = GohoSpacing.rowVertical),
    )
}

/**
 * A Recipes row's content, for rows and the display-only options-sheet header: a 40dp square photo
 * or placeholder, the one-line title, then the total time (“25 min”), left out when it's unknown,
 * or an import's upload tag. A link being sent shows as reading. A null [entry] keeps the same
 * layout for skeleton loading.
 */
@Composable
internal fun RecipeEntrySummary(
    entry: RecipeListEntry?,
    thumbnails: ThumbnailCache,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val recipe = (entry as? RecipeListEntry.Saved)?.recipe
    val import = entry as? RecipeListEntry.Import
    val link =
        when (entry) {
            is RecipeListEntry.Import -> entry.url
            is RecipeListEntry.Adding -> entry.url
            else -> null
        }
    Row(
        modifier.semantics(mergeDescendants = true) {},
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
                    link != null -> recipeDomain(link)
                    else -> ""
                },
                modifier = Modifier.fillMaxWidth().skeleton(fraction = 0.8f),
                style = GohoTheme.type.rowTitle,
                color = c.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            when {
                link != null ->
                    RecipeUploadTag(
                        processing = import?.failed != true,
                        failed = recipeFailureLabel(import?.failure),
                        modifier = Modifier.widthIn(max = GohoSpacing.tagMaxWidth),
                    )
                else ->
                    recipeTime(recipe)?.let {
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

/** Total time, or null when it's unknown; empty while loading so the mask keeps its line. */
@Composable
private fun recipeTime(recipe: RecipeSummary?): String? {
    if (recipe == null) return ""
    val resources = LocalResources.current
    return recipe.totalTimeSeconds?.let { recipeDuration(it, resources) }
}

/**
 * A saved recipe's photo once visible, or the neutral utensils placeholder without one or when it
 * fails to load (the plain fill stands in while it loads); imports and links being sent show a
 * lavender link while reading and an orange one when failed. Decorative: the row text and tag
 * describe the state.
 */
@Composable
private fun RecipeThumbnail(entry: RecipeListEntry?, thumbnails: ThumbnailCache) {
    val c = GohoTheme.colors
    val shape = GohoShapes.thumb
    val recipeId = (entry as? RecipeListEntry.Saved)?.recipe?.takeIf { it.hasImage }?.id
    val import = entry as? RecipeListEntry.Import
    val link = import != null || entry is RecipeListEntry.Adding
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
                    !link -> c.surfaceMuted
                    import?.failed == true -> c.attentionContainer
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
                painterResource(if (link) R.drawable.ic_link else R.drawable.ic_tag_meals),
                contentDescription = null,
                tint =
                    when {
                        !link -> c.textSecondary
                        import?.failed == true -> c.attention
                        else -> c.onAccentContainer
                    },
                modifier = Modifier.size(GohoSpacing.coverIcon),
            )
    }
}
