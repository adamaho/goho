package com.adamaho.goho.ui.components

import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.FirstBaseline
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFontFamilyResolver
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontSynthesis
import androidx.compose.ui.text.font.FontWeight
import kotlin.math.roundToInt

/** Center the visible glyphs, rather than the font's asymmetric ascent/descent space. */
@Composable
internal fun CenteredPillLabel(text: String, style: TextStyle, color: Color) {
    val typeface =
        LocalFontFamilyResolver.current
            .resolve(
                style.fontFamily,
                style.fontWeight ?: FontWeight.Normal,
                style.fontStyle ?: FontStyle.Normal,
                style.fontSynthesis ?: FontSynthesis.All,
            )
            .value as Typeface
    val fontSize = with(LocalDensity.current) { style.fontSize.toPx() }
    val bounds =
        remember(text, typeface, fontSize, style.fontFeatureSettings) {
            Rect().also { bounds ->
                Paint(Paint.ANTI_ALIAS_FLAG)
                    .apply {
                        this.typeface = typeface
                        textSize = fontSize
                        fontFeatureSettings = style.fontFeatureSettings
                    }
                    .getTextBounds(text, 0, text.length, bounds)
            }
        }
    Layout(content = { Text(text, style = style, color = color, maxLines = 1) }) {
        measurables,
        constraints ->
        val label = measurables.single().measure(constraints)
        layout(label.width, label.height) {
            val inkCenter = label[FirstBaseline] + (bounds.top + bounds.bottom) / 2f
            label.placeRelative(0, (label.height / 2f - inkCenter).roundToInt())
        }
    }
}
