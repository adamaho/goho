package com.adamaho.goho.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Category
import com.adamaho.goho.api.generated.model.CategoryColor
import com.adamaho.goho.theme.TagColor
import java.util.Locale

/** Item category metadata from the API; null is only used by the existing loading layout. */
@Composable
internal fun CategoryIcon(category: Category?, modifier: Modifier = Modifier) {
    Tag(
        icon = painterResource(category.iconRes),
        color = category.tagColor,
        contentDescription = category?.displayName.orEmpty(),
        modifier = modifier,
    )
}

/** Labelled category tag for list rows, using the same server icon and colour keys. */
@Composable
internal fun CategoryTag(category: Category, modifier: Modifier = Modifier) {
    Tag(
        label = category.displayName,
        icon = painterResource(category.iconRes),
        color = category.tagColor,
        modifier = modifier,
    )
}

/** Unfamiliar server icon keys use the generic tag icon. */
@get:DrawableRes
internal val Category?.iconRes: Int
    get() =
        when (this?.icon) {
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

internal val Category?.tagColor: TagColor
    get() =
        when (this?.color) {
            CategoryColor.green -> TagColor.Green
            CategoryColor.orange -> TagColor.Orange
            CategoryColor.purple -> TagColor.Purple
            CategoryColor.brown -> TagColor.Brown
            CategoryColor.pink -> TagColor.Pink
            CategoryColor.red -> TagColor.Red
            CategoryColor.blue -> TagColor.Blue
            CategoryColor.yellow -> TagColor.Yellow
            CategoryColor.grey,
            null -> TagColor.Grey
        }

internal val Category.displayName: String
    get() = name.trim().replaceFirstChar { it.titlecase(Locale.getDefault()) }
