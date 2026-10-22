package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R

@Composable
fun NoNeedsAttentionState(modifier: Modifier = Modifier, animateEntrance: Boolean = true) {
    StatusContent(
        title = stringResource(R.string.attention_empty_title),
        description = stringResource(R.string.attention_empty_body),
        modifier = modifier,
        illustration = R.drawable.status_needs_attention,
        animateEntrance = animateEntrance,
    )
}
