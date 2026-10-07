package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R

@Composable
fun NoReceiptsState(modifier: Modifier = Modifier, animateEntrance: Boolean = true) {
    ReceiptStatusContent(
        illustration = R.drawable.status_no_receipts,
        title = stringResource(R.string.receipts_empty_title),
        description = stringResource(R.string.receipts_empty_body),
        modifier = modifier,
        animateEntrance = animateEntrance,
    )
}
