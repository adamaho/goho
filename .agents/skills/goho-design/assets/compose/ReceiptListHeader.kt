package com.adamaho.goho.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import java.text.NumberFormat
import java.util.Locale

@Composable
fun ReceiptListHeader(
    total: Int,
    attention: Int,
    attentionOnly: Boolean,
    onSelect: (Boolean) -> Unit,
    locale: Locale,
    showFilters: Boolean = true,
    hasLoaded: Boolean = true,
    titleMenuOpen: Boolean,
    onTitleMenuChange: (Boolean) -> Unit,
) {
    Column(
        Modifier.fillMaxWidth()
            .padding(horizontal = GohoSpacing.screenMargin)
            .padding(top = GohoSpacing.headerTop, bottom = GohoSpacing.contentGap)
    ) {
        val titleFocus = remember { FocusRequester() }
        Box(Modifier.fillMaxWidth()) {
            SectionTitle(
                title = stringResource(R.string.receipts_title),
                open = titleMenuOpen,
                onClick = { onTitleMenuChange(!titleMenuOpen) },
                modifier =
                    Modifier.padding(start = GohoSpacing.textInsetFromMargin)
                        .focusRequester(titleFocus),
            )
            SectionMenu(
                open = titleMenuOpen,
                entries =
                    listOf(
                        SectionMenuEntry(
                            R.string.receipts_title,
                            R.drawable.ic_add_receipt,
                            selected = true,
                            count =
                                if (hasLoaded) NumberFormat.getIntegerInstance(locale).format(total)
                                else null,
                        ) {},
                        // Books is a dismiss-only placeholder until section switching is
                        // implemented.
                        SectionMenuEntry(R.string.books_title, R.drawable.ic_add_book) {},
                    ),
                onDismiss = { onTitleMenuChange(false) },
                onClosed = { titleFocus.requestFocus() },
            )
        }
        if (showFilters) ReceiptFilter(total, attention, attentionOnly, onSelect, locale)
    }
}
