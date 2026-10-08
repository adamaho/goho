package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R

@Composable
fun ReceiptsConnectionErrorState(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    isRetrying: Boolean = false,
    animateEntrance: Boolean = true,
) {
    val retry = stringResource(R.string.receipts_retry)
    val retrying = stringResource(R.string.receipts_retrying)
    ReceiptStatusContent(
        title = stringResource(R.string.receipts_load_failed),
        description = stringResource(R.string.receipts_load_failed_body),
        modifier = modifier,
        illustration = R.drawable.status_load_error,
        animateEntrance = animateEntrance,
        announcePolitely = true,
    ) {
        GohoActionButton(
            text = if (isRetrying) retrying else retry,
            onClick = onRetry,
            enabled = !isRetrying,
            reserveSpaceFor = listOf(retry, retrying),
        )
    }
}
