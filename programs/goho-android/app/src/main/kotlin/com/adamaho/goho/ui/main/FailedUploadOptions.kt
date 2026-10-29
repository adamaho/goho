package com.adamaho.goho.ui.main

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.ui.components.OptionsSheet

/**
 * The shared options sheet for a receipt or book photo whose transfer failed, headed by its list
 * row. Retry sends it again with the same key; Remove, after the usual confirmation, deletes the
 * photo from the phone. Neither claims anything about the server.
 */
@Composable
internal fun FailedUploadOptions(
    header: @Composable () -> Unit,
    onRetry: () -> Unit,
    onRemove: () -> Unit,
    onDismiss: () -> Unit,
) {
    OptionsSheet(
        title = stringResource(R.string.upload_options),
        deleteLabel = stringResource(R.string.upload_remove),
        deletingLabel = stringResource(R.string.upload_removing),
        deleteFailedMessage = stringResource(R.string.upload_remove_failed),
        cancelLabel = stringResource(R.string.upload_cancel),
        header = header,
        onDelete = {
            onRemove()
            true
        },
        onDismiss = onDismiss,
        retryLabel = stringResource(R.string.upload_retry),
        onRetry = onRetry,
    )
}
