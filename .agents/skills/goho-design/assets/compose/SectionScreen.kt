package com.adamaho.goho.ui.main

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.LayerOutsets
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import java.text.NumberFormat

/** Top-level sections in menu order. */
enum class Section(@StringRes val title: Int, @DrawableRes val icon: Int) {
    Receipts(R.string.receipts_title, R.drawable.ic_add_receipt),
    Books(R.string.books_title, R.drawable.ic_add_book),
}

/**
 * Section root shared by every section: the title menu, safe-area layout and one Add button stay
 * mounted while [content] changes with [section]. Each section's saveable state, such as its filter
 * page and scroll positions, is kept while another section is shown. [content] receives whether a
 * menu is open, so it can pause paging and pull-to-refresh. Null counts are unknown and omitted. A
 * modal overlay that owns the screen fades Add with [addAlpha]; at 0 Add is also hidden from touch,
 * focus and accessibility.
 *
 * A section with a [search] shows its button at the end of the title row while [canSearch]. Open
 * search replaces the title row with Close search and the field, and Add gives way; [content] shows
 * the results. Focus returns to the search button on exit.
 */
@Composable
fun SectionScreen(
    section: Section,
    onSectionChange: (Section) -> Unit,
    receiptCount: Int?,
    bookCount: Int?,
    isOpeningScanner: Boolean,
    onScanBook: () -> Unit,
    onScanReceipt: () -> Unit,
    modifier: Modifier = Modifier,
    addAlpha: () -> Float = { 1f },
    search: SectionSearch? = null,
    canSearch: Boolean = false,
    content: @Composable (menuOpen: Boolean) -> Unit,
) {
    val locale = LocalConfiguration.current.locales[0]
    val reduced = rememberReducedMotion()
    var addMenuOpen by rememberSaveable { mutableStateOf(false) }
    var titleMenuOpen by rememberSaveable { mutableStateOf(false) }
    var pendingSection by remember { mutableStateOf<Section?>(null) }
    val menuOpen = addMenuOpen || titleMenuOpen
    val addHidden by remember(addAlpha) { derivedStateOf { addAlpha() == 0f } }
    val addButtonFocus = remember { FocusRequester() }
    val titleFocus = remember { FocusRequester() }
    val searchButtonFocus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val searching = search?.open == true
    val searchFade =
        tween<Float>(if (reduced) 0 else GohoMotion.SEARCH_MILLIS, easing = FastOutSlowInEasing)
    val searchAddAlpha =
        animateFloatAsState(if (searching) 0f else 1f, searchFade, label = "Search Add")
    // Add takes no taps, focus or accessibility from the moment search opens.
    val addInactive = addHidden || searching
    var wasSearching by remember { mutableStateOf(searching) }
    LaunchedEffect(searching) {
        if (wasSearching && !searching) {
            focusManager.clearFocus()
            if (canSearch) searchButtonFocus.requestFocus()
        }
        wasSearching = searching
    }
    fun closeAddMenu() {
        addMenuOpen = false
        addButtonFocus.requestFocus()
    }
    LaunchedEffect(isOpeningScanner) { if (isOpeningScanner) addMenuOpen = false }
    val sections = rememberSaveableStateHolder()
    // Ignore keyboard insets so Add stays anchored to the window, including during cold start
    // before an outgoing launcher keyboard finishes hiding. Search results pad for the keyboard.
    Box(modifier.fillMaxSize().background(GohoTheme.colors.background)) {
        Column(
            Modifier.fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars.union(WindowInsets.displayCutout))
                .focusProperties { onEnter = { if (menuOpen) cancelFocusChange() } }
                .focusGroup()
                .then(if (menuOpen) Modifier.clearAndSetSemantics {} else Modifier)
        ) {
            // The title row and the search header crossfade; only the incoming one is interactive.
            AnimatedContent(
                searching,
                transitionSpec = {
                    (fadeIn(searchFade) togetherWith fadeOut(searchFade)).using(null)
                },
                label = "Section header",
            ) { open ->
                val leaving = open != searching
                if (open && search != null) SearchHeader(search, Modifier.leaving(leaving))
                else
                    Box(
                        Modifier.leaving(leaving)
                            .fillMaxWidth()
                            .padding(horizontal = GohoSpacing.screenMargin)
                            .padding(top = GohoSpacing.headerTop)
                    ) {
                        SectionTitle(
                            title = stringResource(section.title),
                            open = titleMenuOpen,
                            onClick = {
                                if (!titleMenuOpen) {
                                    addMenuOpen = false
                                    pendingSection = null
                                }
                                titleMenuOpen = !titleMenuOpen
                            },
                            modifier =
                                Modifier.padding(start = GohoSpacing.textInsetFromMargin)
                                    .focusRequester(titleFocus),
                        )
                        if (search != null && canSearch)
                            IconButton(
                                contentDescription = stringResource(search.label),
                                onClick = search::open,
                                enabled = !menuOpen,
                                modifier =
                                    Modifier.align(Alignment.CenterEnd)
                                        .focusRequester(searchButtonFocus),
                            ) {
                                SearchIcon(GohoSpacing.searchIcon)
                            }
                        SectionMenu(
                            open = titleMenuOpen,
                            entries =
                                Section.entries.map { entry ->
                                    val count =
                                        when (entry) {
                                            Section.Receipts -> receiptCount
                                            Section.Books -> bookCount
                                        }
                                    SectionMenuEntry(
                                        entry.title,
                                        entry.icon,
                                        selected = entry == section,
                                        count =
                                            count?.let {
                                                NumberFormat.getIntegerInstance(locale).format(it)
                                            },
                                    ) {
                                        // Keep the title, selected row and page stable during exit.
                                        if (entry != section) pendingSection = entry
                                    }
                                },
                            onDismiss = { titleMenuOpen = false },
                            onClosed = {
                                // Compose the next page only after the popup has finished closing.
                                pendingSection?.let { next ->
                                    pendingSection = null
                                    onSectionChange(next)
                                }
                                titleFocus.requestFocus()
                            },
                        )
                    }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                sections.SaveableStateProvider(section.name) { content(menuOpen) }
            }
        }
        // One persistent action belongs to every section, outside section and page transitions.
        AddMenu(
            open = addMenuOpen,
            actions =
                listOf(
                    AddMenuAction(R.string.scan_book, R.drawable.ic_add_book, onScanBook),
                    AddMenuAction(R.string.scan_receipt, R.drawable.ic_add_receipt, onScanReceipt),
                ),
            onDismiss = ::closeAddMenu,
        )
        AddButton(
            open = addMenuOpen,
            enabled = !isOpeningScanner && !addInactive,
            onClick = { if (addMenuOpen) closeAddMenu() else addMenuOpen = true },
            modifier =
                Modifier.align(Alignment.BottomEnd)
                    .windowInsetsPadding(WindowInsets.systemBars.union(WindowInsets.displayCutout))
                    .padding(end = GohoSpacing.fabMarginEnd, bottom = GohoSpacing.fabBottom)
                    .graphicsLayer {
                        alpha = addAlpha() * searchAddAlpha.value
                        // While fading, keep the face and its shadow together, unclipped.
                        if (alpha < 1f) {
                            compositingStrategy = CompositingStrategy.Offscreen
                            outsets = LayerOutsets(GohoSpacing.addMenuShadowPadding)
                        }
                    }
                    .focusRequester(addButtonFocus)
                    .focusProperties { canFocus = !titleMenuOpen && !addInactive }
                    .then(
                        if (titleMenuOpen || addInactive) Modifier.clearAndSetSemantics {}
                        else Modifier
                    ),
        )
        SectionMenuScrim(open = titleMenuOpen, onDismiss = { titleMenuOpen = false })
    }
}

/**
 * Content leaving a crossfade while the incoming content takes over: it takes no touches, focus or
 * accessibility actions.
 */
internal fun Modifier.leaving(leaving: Boolean): Modifier = focusProperties {
    onEnter = { if (leaving) cancelFocusChange() }
}
    .focusGroup()
    .then(
        if (leaving)
            Modifier.clearAndSetSemantics {}
                .pointerInput(Unit) {
                    awaitPointerEventScope {
                        while (true) awaitPointerEvent(PointerEventPass.Initial).changes.forEach {
                            it.consume()
                        }
                    }
                }
        else Modifier
    )
