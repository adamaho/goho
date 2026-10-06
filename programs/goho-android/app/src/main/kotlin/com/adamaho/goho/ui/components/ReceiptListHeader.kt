package com.adamaho.goho.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import java.util.Locale

@Composable
fun ReceiptListHeader(
    total: Int,
    attention: Int,
    attentionOnly: Boolean,
    onSelect: (Boolean) -> Unit,
    locale: Locale,
    showFilters: Boolean = true,
    showMark: Boolean = true,
) {
    Column(
        Modifier.fillMaxWidth()
            .padding(horizontal = GohoSpacing.screenMargin)
            .padding(top = GohoSpacing.headerTop, bottom = GohoSpacing.contentGap)
    ) {
        Row(
            Modifier.padding(start = GohoSpacing.textInsetFromMargin)
                .heightIn(min = GohoSpacing.headerHeight),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(GohoSpacing.headerMarkGap),
        ) {
            if (showMark)
                Image(
                    painterResource(R.drawable.bram_mark),
                    contentDescription = null,
                    modifier = Modifier.size(GohoSpacing.headerMark),
                )
            Text(
                stringResource(R.string.receipts_title),
                style = GohoTheme.type.screenTitle,
                color = GohoTheme.colors.textPrimary,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
        }
        if (showFilters && (total > 0 || attentionOnly))
            ReceiptFilter(total, attention, attentionOnly, onSelect, locale)
    }
}
