package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R

/** Text-only until Books has approved artwork and a working scan flow. */
@Composable
fun NoBooksState(modifier: Modifier = Modifier, animateEntrance: Boolean = true) {
    StatusContent(
        title = stringResource(R.string.books_empty_title),
        description = stringResource(R.string.books_empty_body),
        modifier = modifier,
        animateEntrance = animateEntrance,
    )
}
