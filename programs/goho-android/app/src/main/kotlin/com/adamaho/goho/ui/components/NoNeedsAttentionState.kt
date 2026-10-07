package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R

@Composable
fun NoNeedsAttentionState(modifier: Modifier = Modifier, animateEntrance: Boolean = true) {
    ReceiptStatusContent(
        title = stringResource(R.string.receipts_attention_empty),
        description = stringResource(R.string.receipts_attention_empty_body),
        modifier = modifier,
        animateEntrance = animateEntrance,
    )
}
