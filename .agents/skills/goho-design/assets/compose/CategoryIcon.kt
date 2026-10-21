package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Category
import com.adamaho.goho.theme.TagColor
import java.util.Locale

/** Item category metadata from the API; null is only used by the existing loading layout. */
@Composable
internal fun CategoryIcon(category: Category?, modifier: Modifier = Modifier) {
    val icon =
        when (category?.icon) {
            "groceries" -> R.drawable.ic_tag_groceries
            "meals" -> R.drawable.ic_tag_meals
            "shopping" -> R.drawable.ic_tag_shopping
            "home" -> R.drawable.ic_tag_home
            "personal_care" -> R.drawable.ic_tag_personal_care
            "health" -> R.drawable.ic_tag_health
            "transport" -> R.drawable.ic_tag_transport
            "entertainment" -> R.drawable.ic_tag_entertainment
            else -> R.drawable.ic_tag_other
        }
    val color =
        when (category?.color) {
            Category.Color.green -> TagColor.Green
            Category.Color.orange -> TagColor.Orange
            Category.Color.purple -> TagColor.Purple
            Category.Color.brown -> TagColor.Brown
            Category.Color.pink -> TagColor.Pink
            Category.Color.red -> TagColor.Red
            Category.Color.blue -> TagColor.Blue
            Category.Color.yellow -> TagColor.Yellow
            Category.Color.grey,
            null -> TagColor.Grey
        }
    Tag(
        icon = painterResource(icon),
        color = color,
        contentDescription = category?.displayName.orEmpty(),
        modifier = modifier,
    )
}

internal val Category.displayName: String
    get() = name.trim().replaceFirstChar { it.titlecase(Locale.getDefault()) }
