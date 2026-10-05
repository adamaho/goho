package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.GohoTheme

@Composable
fun NoNeedsAttentionState(modifier: Modifier = Modifier, animateEntrance: Boolean = true) {
    ReceiptStatusCard(
        illustration =
            if (GohoTheme.colors.isDark) R.drawable.status_needs_attention_dark
            else R.drawable.status_needs_attention,
        title = stringResource(R.string.receipts_attention_empty),
        description = stringResource(R.string.receipts_attention_empty_body),
        modifier = modifier,
        animateEntrance = animateEntrance,
    )
}
