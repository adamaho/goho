package com.adamaho.goho.ui.components

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.TagColor

@Composable
fun ReceiptUploadTag(processing: Boolean, modifier: Modifier = Modifier) {
    UploadTag(processing, R.string.receipt_reading, modifier)
}

@Composable
fun BookUploadTag(processing: Boolean, modifier: Modifier = Modifier) {
    UploadTag(processing, R.string.book_reading, modifier)
}

@Composable
private fun UploadTag(processing: Boolean, @StringRes reading: Int, modifier: Modifier) {
    Tag(
        label = stringResource(if (processing) reading else R.string.not_processed),
        icon =
            painterResource(
                if (processing) R.drawable.ic_tag_processing else R.drawable.ic_tag_failed
            ),
        color = if (processing) TagColor.Purple else TagColor.Orange,
        modifier = modifier,
        shimmer = processing,
    )
}

/**
 * A scan saved on this device: Grey while it uploads, before the server is processing it, and
 * Orange once the upload fails.
 */
@Composable
fun LocalUploadTag(failed: Boolean, modifier: Modifier = Modifier) {
    Tag(
        label =
            stringResource(
                if (failed) R.string.upload_local_failed else R.string.upload_local_uploading
            ),
        icon = painterResource(if (failed) R.drawable.ic_tag_failed else R.drawable.ic_tag_upload),
        color = if (failed) TagColor.Orange else TagColor.Grey,
        modifier = modifier,
        shimmer = !failed,
    )
}
