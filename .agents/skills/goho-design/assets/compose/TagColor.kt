package com.adamaho.goho.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/** Muted display colours, independent of the action-button palette. */
enum class TagColor(
    private val lightContainer: Long,
    private val lightContent: Long,
    private val darkContainer: Long,
    private val darkContent: Long,
) {
    Red(0xFFFDE9EA, 0xFF98313E, 0xFF42252F, 0xFFF2A2AE),
    Orange(0xFFFFF0E1, 0xFF92501E, 0xFF442E21, 0xFFF0B17D),
    Yellow(0xFFF8F1CE, 0xFF705711, 0xFF3D3521, 0xFFE9CF76),
    Green(0xFFE4F2E9, 0xFF2F6846, 0xFF23382F, 0xFF91CFAB),
    Blue(0xFFE5EFFD, 0xFF2E5F98, 0xFF24334B, 0xFF9EBFF1),
    Purple(0xFFE9E9FB, 0xFF444AA0, 0xFF2A2C50, 0xFFB7BBF6),
    Pink(0xFFF9E8F2, 0xFF8B3964, 0xFF42283B, 0xFFE7A2C7),
    Grey(0xFFEDEBF2, 0xFF615C73, 0xFF31303E, 0xFFC3BFD3),
    Brown(0xFFF1E8E0, 0xFF75503A, 0xFF3D2F2A, 0xFFD8B49C);

    internal fun palette(dark: Boolean) =
        TagPalette(
            container = Color(if (dark) darkContainer else lightContainer),
            content = Color(if (dark) darkContent else lightContent),
        )
}

@Immutable internal data class TagPalette(val container: Color, val content: Color)
