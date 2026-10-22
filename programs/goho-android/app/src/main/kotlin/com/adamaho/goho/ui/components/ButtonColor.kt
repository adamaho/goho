package com.adamaho.goho.ui.components

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import com.adamaho.goho.theme.GohoColors

/** Colour is independent of the numbered button finish. */
enum class ButtonColor {
    Purple,
    Red,
    Grey,
}

@Immutable
internal data class ButtonPalette(
    val fill: Color,
    val pressed: Color,
    val content: Color,
    val ring: Color,
    val innerRing: Color,
    val shadow: Color,
    val shade: Color,
)

internal fun GohoColors.buttonPalette(color: ButtonColor): ButtonPalette =
    when (color) {
        ButtonColor.Purple ->
            ButtonPalette(
                buttonPrimary,
                buttonPrimaryPressed,
                onButtonPrimary,
                accentRing,
                buttonInnerRing,
                accentShadow,
                buttonPrimaryShade,
            )
        ButtonColor.Red ->
            ButtonPalette(
                danger,
                dangerPressed,
                onDanger,
                dangerRing,
                dangerInnerRing,
                dangerShadow,
                buttonShade,
            )
        ButtonColor.Grey ->
            ButtonPalette(
                buttonSecondary,
                buttonSecondaryPressed,
                textPrimary,
                secondaryRing,
                glassInnerRing,
                shadow,
                buttonShade,
            )
    }
