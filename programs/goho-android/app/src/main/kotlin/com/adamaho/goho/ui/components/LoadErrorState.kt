package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R

/** Initial list load failure; [description] names what could not be loaded. */
@Composable
fun LoadErrorState(
    description: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    isRetrying: Boolean = false,
    animateEntrance: Boolean = true,
    showProgress: Boolean = false,
) {
    val retry = stringResource(R.string.retry)
    val retrying = stringResource(R.string.retrying)
    StatusContent(
        title = stringResource(R.string.load_failed_title),
        description = description,
        modifier = modifier,
        illustration = R.drawable.status_load_error,
        animateEntrance = animateEntrance,
        announcePolitely = true,
    ) {
        ActionButton(
            text = if (showProgress) retrying else retry,
            onClick = onRetry,
            enabled = !isRetrying,
            loading = showProgress,
            reserveSpaceFor = listOf(retry, retrying),
        )
    }
}
