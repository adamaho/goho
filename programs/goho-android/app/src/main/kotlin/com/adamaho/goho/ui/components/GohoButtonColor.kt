package com.adamaho.goho.ui.components

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import com.adamaho.goho.theme.GohoColors

/** Colour is independent of the numbered button finish. */
enum class GohoButtonColor {
    Purple,
    Red,
    Grey,
}

@Immutable
internal data class GohoButtonPalette(
    val fill: Color,
    val pressed: Color,
    val content: Color,
    val ring: Color,
    val innerRing: Color,
    val shadow: Color,
)

internal fun GohoColors.buttonPalette(color: GohoButtonColor): GohoButtonPalette =
    when (color) {
        GohoButtonColor.Purple ->
            GohoButtonPalette(
                buttonPrimary,
                buttonPrimaryPressed,
                onButtonPrimary,
                accentRing,
                buttonInnerRing,
                accentShadow,
            )
        GohoButtonColor.Red ->
            GohoButtonPalette(
                danger,
                dangerPressed,
                onDanger,
                dangerRing,
                dangerInnerRing,
                dangerShadow,
            )
        GohoButtonColor.Grey ->
            GohoButtonPalette(
                buttonSecondary,
                buttonSecondaryPressed,
                textPrimary,
                secondaryRing,
                glassInnerRing,
                shadow,
            )
    }
