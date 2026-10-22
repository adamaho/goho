package com.adamaho.goho.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import com.adamaho.goho.R
import com.adamaho.goho.theme.*

/** Section heading and menu trigger. Section switching is supplied by the screen. */
@Composable
fun SectionTitle(
    title: String,
    open: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = GohoTheme.colors
    val reduced = rememberReducedMotion()
    val rotation by
        animateFloatAsState(
            if (open) 180f else 0f,
            tween(
                if (reduced) 0
                else if (open) GohoMotion.SECTION_MENU_ENTER_MILLIS
                else GohoMotion.SECTION_MENU_EXIT_MILLIS
            ),
            label = "Section chevron",
        )
    val interaction = remember { MutableInteractionSource() }
    val press by pressProgress(interaction)
    val description = stringResource(R.string.section_title_description, title)
    val state =
        stringResource(
            if (open) R.string.section_menu_expanded else R.string.section_menu_collapsed
        )
    Row(
        modifier
            .heightIn(min = GohoSpacing.headerHeight)
            .pressFeedback { press }
            .clickable(interaction, indication = null, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                heading()
                contentDescription = description
                stateDescription = state
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            title,
            style = GohoTheme.type.screenTitle,
            color = colors.textPrimary,
            modifier = Modifier.weight(1f, fill = false),
        )
        Box(
            Modifier.padding(start = GohoSpacing.sectionChevronGap)
                .size(GohoSpacing.sectionChevronSlot),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(
                Modifier.size(GohoSpacing.sectionChevron).graphicsLayer { rotationZ = rotation }
            ) {
                val stroke = GohoSpacing.iconStroke.toPx()
                drawLine(
                    colors.textSecondary,
                    Offset(size.width * 0.2f, size.height * 0.35f),
                    Offset(size.width * 0.5f, size.height * 0.65f),
                    stroke,
                    StrokeCap.Round,
                )
                drawLine(
                    colors.textSecondary,
                    Offset(size.width * 0.5f, size.height * 0.65f),
                    Offset(size.width * 0.8f, size.height * 0.35f),
                    stroke,
                    StrokeCap.Round,
                )
            }
        }
    }
}
