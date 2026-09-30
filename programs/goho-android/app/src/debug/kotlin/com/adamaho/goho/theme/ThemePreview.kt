package com.adamaho.goho.theme

import android.content.res.Configuration
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview

@Preview(name = "Light", uiMode = Configuration.UI_MODE_NIGHT_NO, widthDp = 412, heightDp = 892)
@Preview(name = "Dark", uiMode = Configuration.UI_MODE_NIGHT_YES, widthDp = 412, heightDp = 892)
@Preview(name = "Large type", fontScale = 1.5f, widthDp = 412, heightDp = 892)
@Composable
fun GohoFoundationPreview() {
    GohoTheme {
        val colors = GohoTheme.colors
        val type = GohoTheme.type
        Column(
            modifier =
                Modifier.fillMaxSize()
                    .background(colors.background)
                    .safeDrawingPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(GohoSpacing.textInset),
            verticalArrangement = Arrangement.spacedBy(GohoSpacing.sectionTop),
        ) {
            Text("goho", style = type.wordmark, color = colors.textPrimary)
            Column(verticalArrangement = Arrangement.spacedBy(GohoSpacing.sectionLabelBottom)) {
                Text(
                    "Manrope · 500 / 600 / 700",
                    style = type.section,
                    color = colors.textSecondary,
                )
                Text("$46.78", style = type.display, color = colors.textPrimary)
                Text("Cedar Hardware", style = type.rowTitle, color = colors.textPrimary)
                Text("Thursday, September 24", style = type.meta, color = colors.textTertiary)
                Text("1111111111", style = type.listValue, color = colors.textPrimary)
                Text("8888888888", style = type.listValue, color = colors.textPrimary)
            }
            Surface(
                color = colors.surface,
                contentColor = colors.textPrimary,
                shape = GohoShapes.card,
            ) {
                Column(
                    Modifier.fillMaxWidth().padding(GohoSpacing.cardPadding),
                    verticalArrangement = Arrangement.spacedBy(GohoSpacing.rowVertical),
                ) {
                    Text("Surface / card · 20dp", style = type.rowTitle)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total", style = type.listRow, color = colors.textSecondary)
                        Text("$46.78", style = type.listValue)
                    }
                    Text("Secondary text", style = type.meta, color = colors.textSecondary)
                    Text("Tertiary text", style = type.meta, color = colors.textTertiary)
                }
            }
            Surface(
                color = colors.surfaceMuted,
                contentColor = colors.textSecondary,
                shape = GohoShapes.thumb,
            ) {
                Text(
                    "Muted surface / thumb · 8dp",
                    Modifier.fillMaxWidth().padding(GohoSpacing.cardPadding),
                    style = type.meta,
                )
            }
            Surface(color = colors.accent, contentColor = colors.onAccent, shape = GohoShapes.fab) {
                Text(
                    "Jade accent",
                    Modifier.fillMaxWidth().padding(GohoSpacing.cardPadding),
                    style = type.button,
                )
            }
            Surface(
                color = colors.accentContainer,
                contentColor = colors.onAccentContainer,
                shape = GohoShapes.pill,
            ) {
                Text(
                    "Reading receipt…",
                    Modifier.padding(GohoSpacing.cardPadding),
                    style = type.label,
                )
            }
            Surface(
                color = colors.attentionContainer,
                contentColor = colors.attention,
                shape = GohoShapes.pill,
            ) {
                Text("Not processed", Modifier.padding(GohoSpacing.cardPadding), style = type.label)
            }
            Surface(
                color = colors.photoWellEdge,
                contentColor = GohoDarkColors.textPrimary,
                shape = GohoShapes.card,
            ) {
                Text(
                    "Photo surface · always dark",
                    Modifier.fillMaxWidth().padding(GohoSpacing.cardPadding),
                    style = type.meta,
                )
            }
        }
    }
}
