package com.adamaho.goho.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

private val LocalGohoColors = staticCompositionLocalOf { GohoLightColors }

object GohoTheme {
    val colors: GohoColors
        @Composable get() = LocalGohoColors.current

    val type: GohoTypography
        get() = GohoType
}

@Composable
fun GohoTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = if (darkTheme) GohoDarkColors else GohoLightColors
    CompositionLocalProvider(LocalGohoColors provides colors) {
        MaterialTheme(
            colorScheme = if (darkTheme) GohoDarkColorScheme else GohoLightColorScheme,
            typography = GohoMaterialTypography,
            shapes = GohoMaterialShapes,
            content = content,
        )
    }
}

private fun GohoColors.materialColorScheme() =
    (if (isDark) darkColorScheme() else lightColorScheme()).copy(
        primary = accent,
        onPrimary = onAccent,
        primaryContainer = accentContainer,
        onPrimaryContainer = onAccentContainer,
        inversePrimary = if (isDark) GohoLightColors.accent else GohoDarkColors.accent,
        secondary = accent,
        onSecondary = onAccent,
        secondaryContainer = accentContainer,
        onSecondaryContainer = onAccentContainer,
        tertiary = attention,
        onTertiary = onAccent,
        tertiaryContainer = attentionContainer,
        onTertiaryContainer = attention,
        background = background,
        onBackground = textPrimary,
        surface = surface,
        onSurface = textPrimary,
        surfaceVariant = surfaceMuted,
        onSurfaceVariant = textSecondary,
        surfaceTint = Color.Transparent,
        inverseSurface = if (isDark) GohoLightColors.surface else GohoDarkColors.surface,
        inverseOnSurface = if (isDark) GohoLightColors.textPrimary else GohoDarkColors.textPrimary,
        error = attention,
        onError = onAccent,
        errorContainer = attentionContainer,
        onErrorContainer = attention,
        outline = textTertiary,
        outlineVariant = divider,
        scrim = Color.Black,
        surfaceBright = segmentSelected,
        surfaceDim = background,
        surfaceContainerLowest = background,
        surfaceContainerLow = surface,
        surfaceContainer = surface,
        surfaceContainerHigh = surfaceMuted,
        surfaceContainerHighest = segmentSelected,
        // Fixed roles keep the same colors across both system themes.
        primaryFixed = GohoLightColors.accentContainer,
        primaryFixedDim = GohoDarkColors.accent,
        onPrimaryFixed = GohoDarkColors.onAccent,
        onPrimaryFixedVariant = GohoLightColors.onAccentContainer,
        secondaryFixed = GohoLightColors.accentContainer,
        secondaryFixedDim = GohoDarkColors.accent,
        onSecondaryFixed = GohoDarkColors.onAccent,
        onSecondaryFixedVariant = GohoLightColors.onAccentContainer,
        tertiaryFixed = GohoLightColors.attentionContainer,
        tertiaryFixedDim = GohoDarkColors.attention,
        onTertiaryFixed = GohoLightColors.textPrimary,
        onTertiaryFixedVariant = GohoLightColors.textPrimary,
    )

private val GohoLightColorScheme = GohoLightColors.materialColorScheme()
private val GohoDarkColorScheme = GohoDarkColors.materialColorScheme()
