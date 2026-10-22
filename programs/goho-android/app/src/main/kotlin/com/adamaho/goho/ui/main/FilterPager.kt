package com.adamaho.goho.ui.main

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.updateTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.clearAndSetSemantics
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import kotlinx.coroutines.launch

/** The All (page 0) and Needs attention (page 1) pages of one section. */
@Stable
internal class FilterPagerState(val pager: PagerState) {
    /** The page whose selection haptic has already been given. */
    var hapticPage by mutableIntStateOf(pager.settledPage)

    /** Moves to [page] without the settle haptic; tab taps supply their own. */
    suspend fun select(page: Int, animate: Boolean) {
        hapticPage = page
        if (animate) pager.animateScrollToPage(page) else pager.scrollToPage(page)
    }
}

/** Saves the selected page with the section's other saveable state. */
@Composable
internal fun rememberFilterPagerState(): FilterPagerState {
    val pager = rememberPagerState { 2 }
    return remember(pager) { FilterPagerState(pager) }
}

/**
 * Filter tabs above a pull-to-refresh pager. Each page receives its filter, the error state to show
 * (outgoing during recovery), whether status content should animate in, and a modifier that hides
 * inactive pages from accessibility.
 */
@Composable
internal fun FilterPager(
    state: FilterPagerState,
    total: Int,
    attention: Int,
    showFilters: Boolean,
    swipeEnabled: Boolean,
    error: Boolean,
    refreshing: Boolean,
    refreshFailed: Boolean,
    refreshEnabled: Boolean,
    onRefresh: () -> Unit,
    refreshLabel: String,
    refreshProgressLabel: String,
    modifier: Modifier = Modifier,
    page:
        @Composable
        (
            attentionOnly: Boolean,
            error: Boolean,
            animateEntrance: Boolean,
            modifier: Modifier,
        ) -> Unit,
) {
    val pagerState = state.pager
    val locale = LocalConfiguration.current.locales[0]
    val scope = rememberCoroutineScope()
    val reduced = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(pagerState.settledPage) {
        if (pagerState.settledPage != state.hapticPage) {
            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
            state.hapticPage = pagerState.settledPage
        }
    }
    val recovery = updateTransition(error, label = "List recovery")
    Column(modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxWidth()
                .padding(horizontal = GohoSpacing.screenMargin)
                .padding(bottom = GohoSpacing.contentGap)
        ) {
            if (showFilters)
                ListFilter(
                    total,
                    attention,
                    pagerState.currentPage == 1,
                    { attentionOnly ->
                        // The tab already supplies its own selection haptic.
                        scope.launch { state.select(if (attentionOnly) 1 else 0, !reduced) }
                    },
                    locale,
                )
        }
        PullToRefresh(
            refreshing = refreshing,
            failed = refreshFailed,
            enabled = refreshEnabled,
            onRefresh = onRefresh,
            refreshLabel = refreshLabel,
            progressLabel = refreshProgressLabel,
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) {
            HorizontalPager(
                state = pagerState,
                beyondViewportPageCount = 1,
                userScrollEnabled = swipeEnabled,
                modifier = Modifier.fillMaxSize(),
            ) { index ->
                recovery.AnimatedContent(
                    transitionSpec = {
                        if (initialState && !targetState && !reduced)
                            (fadeIn(tween(GohoMotion.STATUS_CROSSFADE_MILLIS)) togetherWith
                                    fadeOut(tween(GohoMotion.STATUS_CROSSFADE_MILLIS)))
                                .using(null)
                        else (EnterTransition.None togetherWith ExitTransition.None).using(null)
                    }
                ) { shownError ->
                    page(
                        index == 1,
                        shownError,
                        !recovery.currentState,
                        if (shownError != error || index != pagerState.currentPage)
                            Modifier.clearAndSetSemantics {}
                        else Modifier,
                    )
                }
            }
        }
    }
}
