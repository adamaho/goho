package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R

/** Text-only, by request: Recipes has no empty-state artwork. */
@Composable
fun NoRecipesState(modifier: Modifier = Modifier, animateEntrance: Boolean = true) {
    StatusContent(
        title = stringResource(R.string.recipes_empty_title),
        description = stringResource(R.string.recipes_empty_body),
        modifier = modifier,
        animateEntrance = animateEntrance,
    )
}
