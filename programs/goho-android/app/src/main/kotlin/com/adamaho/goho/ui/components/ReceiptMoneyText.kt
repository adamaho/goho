package com.adamaho.goho.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import com.adamaho.goho.theme.GohoTheme
import java.util.Currency
import java.util.Locale

/** Show a currency code only where it identifies the receipt: the list total and details hero. */
@Composable
internal fun receiptMoneyText(
    amount: String,
    currencyCode: String?,
    locale: Locale,
    codeStyle: TextStyle = GohoTheme.type.currencyCode,
    showCurrencyCode: Boolean = false,
): AnnotatedString {
    val code = currencyCode?.takeIf { it.isNotBlank() }
    val localizedSymbol =
        code
            ?.let { runCatching { Currency.getInstance(it).getSymbol(locale) }.getOrNull() }
            .orEmpty()
    // The trailing code already disambiguates dollars and currencies whose symbol is their code.
    val symbol =
        when {
            localizedSymbol.endsWith("$") -> "$"
            localizedSymbol == code -> ""
            else -> localizedSymbol
        }
    return buildAnnotatedString {
        if (amount == "—") {
            append(amount)
        } else {
            if (amount.startsWith("-")) {
                append("-")
                append(symbol)
                append(amount.drop(1))
            } else {
                append(symbol)
                append(amount)
            }
            if (showCurrencyCode && code != null) {
                withStyle(codeStyle.copy(color = GohoTheme.colors.textTertiary).toSpanStyle()) {
                    append("\u00a0")
                    append(code)
                }
            }
        }
    }
}
