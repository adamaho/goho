package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.TagColor
import java.util.Locale

/** The API currently supplies names only. Unknown names retain a neutral tag and their label. */
@Composable
fun ReceiptCategoryTag(category: String, modifier: Modifier = Modifier) {
    val locale = LocalConfiguration.current.locales[0]
    val name = category.trim()
    val (color, icon) =
        when (name.lowercase(Locale.ROOT)) {
            "health",
            "health and fitness",
            "medical" -> TagColor.Red to R.drawable.ic_tag_health
            "meals",
            "dining",
            "restaurants",
            "prepared foods" -> TagColor.Orange to R.drawable.ic_tag_meals
            "entertainment" -> TagColor.Yellow to R.drawable.ic_tag_entertainment
            "groceries",
            "grocery",
            "produce",
            "dairy",
            "seafood" -> TagColor.Green to R.drawable.ic_tag_groceries
            "transport",
            "transportation",
            "travel" -> TagColor.Blue to R.drawable.ic_tag_transport
            "shopping",
            "general merchandise" -> TagColor.Purple to R.drawable.ic_tag_shopping
            "personal care",
            "beauty" -> TagColor.Pink to R.drawable.ic_tag_personal_care
            "home",
            "home & garden",
            "household" -> TagColor.Brown to R.drawable.ic_tag_home
            else -> TagColor.Grey to R.drawable.ic_tag_other
        }
    Tag(
        label = name.replaceFirstChar { it.titlecase(locale) },
        icon = painterResource(icon),
        color = color,
        modifier = modifier,
    )
}

@Composable
fun ReceiptUploadTag(processing: Boolean, modifier: Modifier = Modifier) {
    Tag(
        label =
            stringResource(
                if (processing) R.string.receipt_reading else R.string.receipt_not_processed
            ),
        icon =
            painterResource(
                if (processing) R.drawable.ic_tag_processing else R.drawable.ic_tag_failed
            ),
        color = if (processing) TagColor.Purple else TagColor.Orange,
        modifier = modifier,
        shimmer = processing,
    )
}
