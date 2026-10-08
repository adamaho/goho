// Goho design tokens for Jetpack Compose.
// Bram palette, shape and motion values synchronized with PR #101.
// Reference implementation from the design handoff. Adjust the package name and
// font resource names to match the project, then wrap the app in GohoTheme { }.
package com.goho.ui.theme // TODO: match the app's package

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.goho.R // TODO: the app's R class

// ---------- Color ----------

@Immutable
data class GohoColors(
    val isDark: Boolean,
    val background: Color,
    val surface: Color, // cards
    val surfaceMuted: Color, // filter track, round icon buttons, thumbnail placeholder
    val surfaceMutedPressed: Color, // pressed round icon button
    val segmentSelected: Color, // selected filter segment
    val surfacePressed: Color, // pressed row
    val skeletonBase: Color,
    val skeletonShimmer: Color,
    val photoWellCenter: Color, // photo frame and viewer stay dark in both themes
    val photoWellEdge: Color,
    val photoControl: Color, // expand/close buttons that sit on the photo well
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val divider: Color,
    val outline: Color, // thumbnail border, light-mode card ring
    val shadow: Color, // ambient/spot color for neutral shadows
    val accent: Color,
    val accentRing: Color,
    val accentPressed: Color,
    val onAccent: Color,
    val buttonSecondary: Color,
    val buttonSecondaryPressed: Color,
    val accentShadow: Color, // spot color under the Scan button
    val accentContainer: Color,
    val onAccentContainer: Color,
    val accentShimmer: Color,
    val danger: Color,
    val dangerRing: Color,
    val dangerPressed: Color,
    val onDanger: Color,
    val dangerShadow: Color,
    val dangerContainer: Color,
    val onDangerContainer: Color,
    val sheet: Color,
    val grabber: Color,
    val scrim: Color,
    val attention: Color,
    val attentionContainer: Color,
    val buttonInnerRing: Color,
    val dangerInnerRing: Color,
    val secondaryRing: Color,
    val buttonShadowAlpha: Float,
    val buttonWideShadowAlpha: Float,
    val secondaryShadowAlpha: Float,
    val secondaryWideShadowAlpha: Float,
    val statusCard: Color,
    val statusCardRing: Color,
)

private val PhotoWellCenter = Color(0xFF2A2724)
private val PhotoWellEdge = Color(0xFF0C0B0A)
private val PhotoControl = Color(0xFF1D1B19).copy(alpha = 0.78f)

val GohoDarkColors =
    GohoColors(
        isDark = true,
        danger = Color(0xFFC52B2D),
        dangerRing = Color(0xFFA21F22),
        dangerPressed = Color(0xFFB01E22),
        onDanger = Color(0xFFFFFFFF),
        dangerShadow = Color(0xFF000000),
        dangerContainer = Color(0xFF4D1C1B),
        onDangerContainer = Color(0xFFF87E79),
        sheet = Color(0xFF1F1E2A),
        grabber = Color(0xFF3A3948),
        scrim = Color.Black.copy(alpha = 0.55f),
        background = Color(0xFF15141D),
        surface = Color(0xFF1F1E2A),
        surfaceMuted = Color(0xFF1F1E2A),
        surfaceMutedPressed = Color(0xFF2B2A38),
        segmentSelected = Color(0xFF2B2A38),
        surfacePressed = Color(0xFF252432),
        skeletonBase = Color(0xFF2B2A38),
        skeletonShimmer = Color(0xFF3A3948),
        photoWellCenter = PhotoWellCenter,
        photoWellEdge = PhotoWellEdge,
        photoControl = PhotoControl,
        textPrimary = Color(0xFFF1EFF8),
        textSecondary = Color(0xFFBBB8CC),
        textTertiary = Color(0xFF9794AB),
        divider = Color.White.copy(alpha = 0.05f),
        outline = Color.White.copy(alpha = 0.06f),
        shadow = Color.Black,
        accent = Color(0xFFA6ABF0),
        accentRing = Color(0xFF8288D2),
        accentPressed = Color(0xFF959AE3),
        onAccent = Color(0xFF17183D),
        buttonSecondary = Color(0xFF2B2A38),
        buttonSecondaryPressed = Color(0xFF252432),
        accentShadow = Color.Black,
        accentContainer = Color(0xFF2A2C50),
        onAccentContainer = Color(0xFFB7BBF6),
        accentShimmer = Color(0xFFE4E5FD),
        attention = Color(0xFFED9658),
        attentionContainer = Color(0xFF3F2717),
        buttonInnerRing = Color.White.copy(alpha = 0.22f),
        dangerInnerRing = Color.White.copy(alpha = 0.16f),
        secondaryRing = Color.White.copy(alpha = 0.08f),
        buttonShadowAlpha = 0.4f,
        buttonWideShadowAlpha = 0.6f,
        secondaryShadowAlpha = 0.12f,
        secondaryWideShadowAlpha = 0.2f,
        statusCard = Color.White.copy(alpha = 0.025f),
        statusCardRing = Color.White.copy(alpha = 0.07f),
    )

val GohoLightColors =
    GohoColors(
        isDark = false,
        danger = Color(0xFFBE2323),
        dangerRing = Color(0xFF9A1A1B),
        dangerPressed = Color(0xFFA21A1B),
        onDanger = Color(0xFFFFFFFF),
        dangerShadow = Color(0xFF6E0F0F),
        dangerContainer = Color(0xFFFFE8E7),
        onDangerContainer = Color(0xFFB7191C),
        sheet = Color(0xFFFFFFFF),
        grabber = Color(0xFFD9D6E2),
        scrim = Color(0xFF26233A).copy(alpha = 0.38f),
        background = Color(0xFFFBF8F4),
        surface = Color(0xFFFFFFFF),
        surfaceMuted = Color(0xFFF1EEF4),
        surfaceMutedPressed = Color(0xFFE6E2EC),
        segmentSelected = Color(0xFFFFFFFF),
        surfacePressed = Color(0xFFF7F4F9),
        skeletonBase = Color(0xFFECE9F1),
        skeletonShimmer = Color(0xFFFBF8F4),
        photoWellCenter = PhotoWellCenter,
        photoWellEdge = PhotoWellEdge,
        photoControl = PhotoControl,
        textPrimary = Color(0xFF26233A),
        textSecondary = Color(0xFF5B5870),
        textTertiary = Color(0xFF6E6A83),
        divider = Color(0xFF26233A).copy(alpha = 0.06f),
        outline = Color(0xFF26233A).copy(alpha = 0.08f),
        shadow = Color(0xFF26233A),
        accent = Color(0xFF8B91D6),
        accentRing = Color(0xFF767CC2),
        accentPressed = Color(0xFF7D83CB),
        onAccent = Color(0xFF1B1C45),
        buttonSecondary = Color(0xFFFFFFFF),
        buttonSecondaryPressed = Color(0xFFF7F4F9),
        accentShadow = Color(0xFF3A3D86),
        accentContainer = Color(0xFFE9E9FB),
        onAccentContainer = Color(0xFF444AA0),
        accentShimmer = Color(0xFF9CA1E6),
        attention = Color(0xFFA34D16),
        attentionContainer = Color(0xFFFFEADC),
        buttonInnerRing = Color.White.copy(alpha = 0.22f),
        dangerInnerRing = Color.White.copy(alpha = 0.14f),
        secondaryRing = Color(0xFF26233A).copy(alpha = 0.06f),
        buttonShadowAlpha = 0.16f,
        buttonWideShadowAlpha = 0.32f,
        secondaryShadowAlpha = 0.05f,
        secondaryWideShadowAlpha = 0.18f,
        statusCard = Color.White.copy(alpha = 0.6f),
        statusCardRing = Color(0xFF26233A).copy(alpha = 0.06f),
    )

// ---------- Type ----------

// Bundle Geist (Google Fonts, OFL) in res/font with these names. Only 400, 500 and 600 are used.
val Geist = FontFamily(
    Font(R.font.geist_regular, FontWeight.Normal),
    Font(R.font.geist_medium, FontWeight.Medium),
    Font(R.font.geist_semibold, FontWeight.SemiBold),
)

private const val PROPORTIONAL_NUMBERS = "'tnum' 0, 'pnum' 1"

@Immutable
data class GohoTypography(
    val display: TextStyle,
    val title: TextStyle,
    val wordmark: TextStyle,
    val rowTitle: TextStyle,
    val button: TextStyle,
    val buttonSecondary: TextStyle,
    val listRow: TextStyle,
    val body: TextStyle,
    val listValue: TextStyle,
    val meta: TextStyle,
    val section: TextStyle,
    val label: TextStyle,
)

val GohoType = GohoTypography(
    display = TextStyle(fontFamily = Geist, fontWeight = FontWeight.SemiBold, fontSize = 44.sp, lineHeight = 48.sp, letterSpacing = (-0.035).em, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    title = TextStyle(fontFamily = Geist, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp, letterSpacing = (-0.025).em, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    wordmark = TextStyle(fontFamily = Geist, fontWeight = FontWeight.SemiBold, fontSize = 32.sp, lineHeight = 36.sp, letterSpacing = (-0.035).em, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    rowTitle = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp, letterSpacing = (-0.01).em, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    button = TextStyle(fontFamily = Geist, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, lineHeight = 20.sp, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    buttonSecondary = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 20.sp, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    body = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    listRow = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 20.sp, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    listValue = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    meta = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 18.sp, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    section = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Medium, fontSize = 13.sp, lineHeight = 18.sp, fontFeatureSettings = PROPORTIONAL_NUMBERS),
    label = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp, fontFeatureSettings = PROPORTIONAL_NUMBERS),
)

// ---------- Shape ----------

object GohoShapes {
    val statusCard = RoundedCornerShape(32.dp)
    val thumb = RoundedCornerShape(8.dp)
    val button = RoundedCornerShape(20.dp)
    val card = RoundedCornerShape(20.dp)
    val fab = RoundedCornerShape(24.dp)
    val sheet = RoundedCornerShape(28.dp)
    val pill = RoundedCornerShape(percent = 50)
}

// ---------- Spacing ----------

object GohoSpacing {
    val statusCardTop = 28.dp
    val statusCardSide = 24.dp
    val statusCardBottom = 32.dp
    val statusCardActionBottom = 24.dp
    val statusIllustrationWidth = 220.dp
    val statusIllustrationHeight = 190.dp
    val statusTitleTop = 4.dp
    val statusBodyTop = 6.dp
    val statusBodyMaxWidth = 290.dp
    val statusActionTop = 22.dp
    val sheetInset = 8.dp
    val sheetPadding = 20.dp
    val sheetElevation = 16.dp
    val sheetGrabberWidth = 36.dp
    val sheetGrabberHeight = 4.dp
    val sheetHeaderTop = 18.dp
    val sheetHeaderGap = 14.dp
    val sheetSummaryLineGap = 3.dp
    val sheetThumbWidth = 56.dp
    val sheetThumbHeight = 68.dp
    val sheetContentTop = 18.dp
    val sheetMenuTop = 6.dp
    val sheetActionHeight = 56.dp
    val sheetActionGap = 16.dp
    val sheetActionIcon = 22.dp
    val sheetErrorTop = 4.dp
    val sheetButtonsTop = 18.dp
    val buttonHeight = 52.dp
    val buttonHorizontal = 20.dp
    val buttonGap = 10.dp
    val loadingIcon = 24.dp
    val buttonIcon = 18.dp
    val buttonIconGap = 8.dp
    val buttonRingInset = 1.5.dp
    val buttonShadowRadius = 2.dp
    val buttonShadowY = 1.dp
    val buttonWideShadowRadius = 24.dp
    val buttonWideShadowY = 10.dp
    val buttonWideShadowSpread = (-8).dp
    val secondaryWideShadowSpread = (-10).dp
    val flatElevation = 0.dp
    val previewMinHeight = 480.dp
    val photoPadding = 24.dp
    val photoElevation = 8.dp
    val photoCloseIcon = 20.dp
    val photoCloseTop = 4.dp
    val photoDismissDistance = 120.dp
    val photoDragRange = 300.dp
    val previewFooterTop = 16.dp
    val screenMargin = 16.dp
    val textInset = 20.dp
    val textInsetFromMargin = 4.dp // textInset - screenMargin
    val cardPadding = 16.dp
    val cardVerticalPadding = 4.dp
    val rowVertical = 12.dp
    val rowMinHeight = 72.dp
    val thumbWidth = 40.dp
    val thumbHeight = 48.dp
    val thumbToText = 12.dp
    val dividerStart = 68.dp // cardPadding + thumbWidth + thumbToText
    val detailTopBarHeight = 56.dp
    val detailBackIcon = 20.dp
    val detailMenuDotRadius = 1.5.dp
    val detailHeroGap = 8.dp
    val detailPhotoTop = 20.dp
    val detailPhotoHeight = 200.dp
    val detailRowVertical = 12.dp
    val detailBottom = 24.dp
    val itemVertical = 14.dp
    val itemGap = 16.dp
    val itemCardTop = 2.dp
    val detailRowHeight = 47.dp
    val sectionTop = 24.dp
    val sectionLabelBottom = 8.dp
    val fabBottom = 28.dp
    val hairline = 1.dp
    val headerHeight = 44.dp
    val headerTop = 4.dp
    val headerFadeHeight = 12.dp
    val lineGap = 5.dp
    val contentGap = 12.dp
    val pillHeight = 22.dp
    val pillHorizontal = 9.dp
    val skeletonWidth = 52.dp
    val skeletonHeight = 12.dp
    val listBottom = 112.dp
    val fabHeight = 56.dp
    val fabStart = 18.dp
    val fabEnd = 22.dp
    val fabIcon = 22.dp
    val fabIconGap = 9.dp
    val iconStroke = 2.dp
    val compactWidth = 360.dp
    val filterTop = 16.dp
    val filterPadding = 3.dp
    val filterGap = 6.dp
    val filterTouchInset = 4.dp
    val filterVisualHeight = 36.dp
    val placeholderWidth = 20.dp
    val placeholderHeight = 28.dp
    val placeholderStroke = 1.5.dp
    val segmentHorizontal = 10.dp
    val segmentCountGap = 5.dp
    val badgeSize = 20.dp
    val amountMaxWidth = 148.dp
}

// ---------- Motion ----------

object GohoMotion {
    const val LOADING_DELAY_MILLIS = 200L
    const val LOADING_SPIN_MILLIS = 1000
    const val STATUS_ENTER_MILLIS = 200
    const val STATUS_CROSSFADE_MILLIS = 200
    val statusEnterTranslation = 6.dp
    const val PRESS_SCALE = 0.03f      // scale = 1 - PRESS_SCALE * progress
    val pressTranslation = 1.dp
    val pressIn: AnimationSpec<Float> = tween(durationMillis = 90)
    val pressOut: AnimationSpec<Float> = spring(dampingRatio = 0.55f, stiffness = 700f)
    val pressOutReduced: AnimationSpec<Float> = snap()
    const val SEGMENT_MILLIS = 160
    const val SHIMMER_MILLIS = 1800
}

// ---------- Theme ----------

private val LocalGohoColors = staticCompositionLocalOf { GohoLightColors }
private val LocalGohoType = staticCompositionLocalOf { GohoType }

object GohoTheme {
    val colors: GohoColors @Composable get() = LocalGohoColors.current
    val type: GohoTypography @Composable get() = LocalGohoType.current
}

/**
 * Follows the system setting by default. The photo viewer always wraps itself in
 * GohoTheme(darkTheme = true) so photos are shown on dark in both themes.
 */
@Composable
fun GohoTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val c = if (darkTheme) GohoDarkColors else GohoLightColors
    // Map onto Material 3 so any stray M3 component (dialogs, menus, text selection) matches.
    val base = if (darkTheme) darkColorScheme() else lightColorScheme()
    val scheme = base.copy(
        primary = c.accent,
        onPrimary = c.onAccent,
        primaryContainer = c.accentContainer,
        onPrimaryContainer = c.onAccentContainer,
        background = c.background,
        onBackground = c.textPrimary,
        surface = c.surface,
        onSurface = c.textPrimary,
        surfaceVariant = c.surfaceMuted,
        onSurfaceVariant = c.textSecondary,
        surfaceContainer = c.surface,
        surfaceContainerHigh = c.surfaceMuted,
        outline = c.textTertiary,
        outlineVariant = c.divider,
        error = c.attention,
        onError = c.onAccent,
        errorContainer = c.attentionContainer,
        onErrorContainer = c.attention,
    )
    CompositionLocalProvider(
        LocalGohoColors provides c,
        LocalGohoType provides GohoType,
    ) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
