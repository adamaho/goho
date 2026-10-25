package com.adamaho.goho.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import com.adamaho.goho.theme.*

/**
 * Single-line search input on a `surface` pill: a search glyph, the query or [placeholder], and a
 * round clear control once there is a query. The focused field has the accent ring. The keyboard's
 * Search action only hides the keyboard and returns the field to rest, keeping the query; results
 * are expected to follow [state] as it changes. [onClear] empties the query.
 */
@Composable
fun SearchField(
    state: TextFieldState,
    placeholder: String,
    clearLabel: String,
    onClear: () -> Unit,
    focusRequester: FocusRequester,
    modifier: Modifier = Modifier,
) {
    val c = GohoTheme.colors
    val focusManager = LocalFocusManager.current
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val empty = state.text.isEmpty()
    BasicTextField(
        state = state,
        modifier = modifier.focusRequester(focusRequester),
        textStyle = GohoTheme.type.input.copy(color = c.textPrimary),
        lineLimits = TextFieldLineLimits.SingleLine,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        onKeyboardAction = { focusManager.clearFocus() },
        interactionSource = interaction,
        cursorBrush = SolidColor(c.accent),
        decorator = { input ->
            Row(
                Modifier.heightIn(min = GohoSpacing.headerHeight)
                    .clip(GohoShapes.pill)
                    .background(c.surface)
                    .border(
                        if (focused) GohoSpacing.searchFocusRing else GohoSpacing.hairline,
                        if (focused) c.accent else c.outline,
                        GohoShapes.pill,
                    )
                    .padding(start = GohoSpacing.searchFieldStart),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SearchIcon(GohoSpacing.searchFieldIcon, c.textTertiary)
                Box(
                    Modifier.weight(1f)
                        .padding(start = GohoSpacing.searchFieldIconGap)
                        .then(
                            if (empty) Modifier.padding(end = GohoSpacing.searchFieldStart)
                            else Modifier
                        )
                ) {
                    if (empty)
                        Text(
                            placeholder,
                            style = GohoTheme.type.input,
                            color = c.textTertiary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    input()
                }
                if (!empty) ClearButton(clearLabel, onClear)
            }
        },
    )
}

/** The 28dp clear face, centred in a 44dp touch target that ends at the field's edge. */
@Composable
private fun ClearButton(label: String, onClick: () -> Unit) {
    val c = GohoTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val progress by pressProgress(interaction)
    Box(
        Modifier.size(GohoSpacing.headerHeight)
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClickLabel = label,
                onClick = onClick,
            )
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.pressFeedback { progress }
                .size(GohoSpacing.searchClear)
                .clip(GohoShapes.pill)
                .background(c.surfaceMuted),
            contentAlignment = Alignment.Center,
        ) {
            CompositionLocalProvider(LocalContentColor provides c.textSecondary) {
                CloseIcon(GohoSpacing.searchClearIcon)
            }
        }
    }
}

/** A magnifying glass with a 2dp stroke, for the search button and field. */
@Composable
fun SearchIcon(size: Dp, color: Color = LocalContentColor.current) {
    Canvas(Modifier.size(size)) {
        val stroke = GohoSpacing.iconStroke.toPx()
        drawCircle(
            color,
            radius = this.size.width * 0.3f,
            center = Offset(this.size.width * 0.44f, this.size.height * 0.44f),
            style = Stroke(stroke),
        )
        drawLine(
            color,
            Offset(this.size.width * 0.66f, this.size.height * 0.66f),
            Offset(this.size.width * 0.86f, this.size.height * 0.86f),
            stroke,
            StrokeCap.Round,
        )
    }
}
