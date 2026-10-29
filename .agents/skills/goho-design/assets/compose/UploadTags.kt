package com.adamaho.goho.ui.components

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.TagColor

/**
 * A scan that has no finished record yet: sending from the phone, kept on the phone after its
 * transfer failed, processing on the server, or not processed there.
 */
enum class ScanStatus {
    Uploading,
    UploadFailed,
    Processing,
    NotProcessed,
}

val ScanStatus.failed: Boolean
    get() = this == ScanStatus.UploadFailed || this == ScanStatus.NotProcessed

@Composable
fun ReceiptUploadTag(status: ScanStatus, modifier: Modifier = Modifier) {
    UploadTag(status, R.string.receipt_reading, modifier)
}

@Composable
fun BookUploadTag(status: ScanStatus, modifier: Modifier = Modifier) {
    UploadTag(status, R.string.book_reading, modifier)
}

@Composable
private fun UploadTag(status: ScanStatus, @StringRes reading: Int, modifier: Modifier) {
    Tag(
        label =
            stringResource(
                when (status) {
                    ScanStatus.Uploading -> R.string.upload_uploading
                    ScanStatus.UploadFailed -> R.string.upload_failed
                    ScanStatus.Processing -> reading
                    ScanStatus.NotProcessed -> R.string.not_processed
                }
            ),
        icon =
            painterResource(
                if (status.failed) R.drawable.ic_tag_failed else R.drawable.ic_tag_processing
            ),
        color = if (status.failed) TagColor.Orange else TagColor.Purple,
        modifier = modifier,
        shimmer = !status.failed,
    )
}
