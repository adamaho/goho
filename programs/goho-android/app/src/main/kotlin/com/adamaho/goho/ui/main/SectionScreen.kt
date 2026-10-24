package com.adamaho.goho.ui.main

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
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
import androidx.compose.ui.platform.LocalConfiguration
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
    content: @Composable (menuOpen: Boolean) -> Unit,
) {
    val locale = LocalConfiguration.current.locales[0]
    var addMenuOpen by rememberSaveable { mutableStateOf(false) }
    var titleMenuOpen by rememberSaveable { mutableStateOf(false) }
    var pendingSection by remember { mutableStateOf<Section?>(null) }
    val menuOpen = addMenuOpen || titleMenuOpen
    val addHidden by remember(addAlpha) { derivedStateOf { addAlpha() == 0f } }
    val addButtonFocus = remember { FocusRequester() }
    val titleFocus = remember { FocusRequester() }
    fun closeAddMenu() {
        addMenuOpen = false
        addButtonFocus.requestFocus()
    }
    LaunchedEffect(isOpeningScanner) { if (isOpeningScanner) addMenuOpen = false }
    val sections = rememberSaveableStateHolder()
    // Sections have no text input. Ignore an outgoing launcher keyboard's insets so Add stays
    // anchored to the window during cold start, before the IME finishes hiding.
    Box(modifier.fillMaxSize().background(GohoTheme.colors.background)) {
        Column(
            Modifier.fillMaxSize()
                .windowInsetsPadding(WindowInsets.systemBars.union(WindowInsets.displayCutout))
                .focusProperties { onEnter = { if (menuOpen) cancelFocusChange() } }
                .focusGroup()
                .then(if (menuOpen) Modifier.clearAndSetSemantics {} else Modifier)
        ) {
            Box(
                Modifier.fillMaxWidth()
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
            enabled = !isOpeningScanner && !addHidden,
            onClick = { if (addMenuOpen) closeAddMenu() else addMenuOpen = true },
            modifier =
                Modifier.align(Alignment.BottomEnd)
                    .windowInsetsPadding(WindowInsets.systemBars.union(WindowInsets.displayCutout))
                    .padding(end = GohoSpacing.fabMarginEnd, bottom = GohoSpacing.fabBottom)
                    .graphicsLayer {
                        alpha = addAlpha()
                        // While fading, keep the face and its shadow together, unclipped.
                        if (alpha < 1f) {
                            compositingStrategy = CompositingStrategy.Offscreen
                            outsets = LayerOutsets(GohoSpacing.addMenuShadowPadding)
                        }
                    }
                    .focusRequester(addButtonFocus)
                    .focusProperties { canFocus = !titleMenuOpen && !addHidden }
                    .then(
                        if (titleMenuOpen || addHidden) Modifier.clearAndSetSemantics {}
                        else Modifier
                    ),
        )
        SectionMenuScrim(open = titleMenuOpen, onDismiss = { titleMenuOpen = false })
    }
}
