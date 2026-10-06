package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.GohoTheme

@Composable
fun ReceiptsConnectionErrorState(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    isRetrying: Boolean = false,
    animateEntrance: Boolean = true,
) {
    val retry = stringResource(R.string.receipts_retry)
    val retrying = stringResource(R.string.receipts_retrying)
    ReceiptStatusCard(
        illustration =
            if (GohoTheme.colors.isDark) R.drawable.status_load_error_dark
            else R.drawable.status_load_error,
        title = stringResource(R.string.receipts_load_failed),
        description = stringResource(R.string.receipts_load_failed_body),
        modifier = modifier,
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
