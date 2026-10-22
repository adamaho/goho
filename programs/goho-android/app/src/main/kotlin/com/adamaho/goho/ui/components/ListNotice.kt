package com.adamaho.goho.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.adamaho.goho.theme.GohoSpacing
import com.adamaho.goho.theme.GohoTheme

/** Polite inline message above a list, with an optional secondary action. */
@Composable
fun ListNotice(message: String, action: String? = null, onAction: () -> Unit = {}) {
    val c = GohoTheme.colors
    Column(
        Modifier.fillMaxWidth()
            .padding(
                horizontal = GohoSpacing.textInsetFromMargin,
                vertical = GohoSpacing.contentGap,
            )
    ) {
        Text(
            message,
            style = GohoTheme.type.meta,
            color = c.textSecondary,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        if (action != null)
            ActionButton(
                action,
                onAction,
                modifier = Modifier.padding(top = GohoSpacing.contentGap),
                variant = 2,
                color = ButtonColor.Grey,
            )
    }
}
