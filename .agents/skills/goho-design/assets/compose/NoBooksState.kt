package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R

@Composable
fun NoBooksState(modifier: Modifier = Modifier, animateEntrance: Boolean = true) {
    StatusContent(
        illustration = R.drawable.status_no_books,
        title = stringResource(R.string.books_empty_title),
        description = stringResource(R.string.books_empty_body),
        modifier = modifier,
        animateEntrance = animateEntrance,
    )
}
