package com.adamaho.goho.ui.components

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

/** Polite inline message above a list. */
@Composable
fun ListNotice(message: String) {
    Text(
        message,
        style = GohoTheme.type.meta,
        color = GohoTheme.colors.textSecondary,
        modifier =
            Modifier.fillMaxWidth()
                .padding(
                    horizontal = GohoSpacing.textInsetFromMargin,
                    vertical = GohoSpacing.contentGap,
                )
                .semantics { liveRegion = LiveRegionMode.Polite },
    )
}
