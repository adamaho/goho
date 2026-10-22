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
