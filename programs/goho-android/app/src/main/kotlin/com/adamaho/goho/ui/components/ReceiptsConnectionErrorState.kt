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
) {
    ReceiptStatusCard(
        illustration =
            if (GohoTheme.colors.isDark) R.drawable.status_load_error_dark
            else R.drawable.status_load_error,
        title = stringResource(R.string.receipts_load_failed),
        description = stringResource(R.string.receipts_load_failed_body),
        modifier = modifier,
    ) {
        GohoActionButton(
            text =
                stringResource(
                    if (isRetrying) R.string.receipts_retrying else R.string.receipts_retry
                ),
            onClick = onRetry,
            enabled = !isRetrying,
        )
    }
}
