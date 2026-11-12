package com.adamaho.goho.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.clearText
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*
import kotlinx.coroutines.launch

/**
 * The Add recipe sheet, opened from the Add menu: the shared [Sheet] with the link form and no item
 * header. A valid link goes to [onAdd] at once and the sheet closes; the import is sent and shown
 * by the activity. Cancel, Back, the scrim and drag-down close it without a request, Back first
 * hiding the keyboard. Once a link is handed off or the sheet starts to leave, by Cancel, Back, the
 * scrim or a drag, Add recipe and Done send nothing more; a closing sheet also ignores dismissal
 * gestures while its own exit runs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AddRecipeSheet(onAdd: (String) -> Unit, onDismiss: () -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var added by remember { mutableStateOf(false) }
    var closing by remember { mutableStateOf(false) }
    fun close() {
        if (closing) return
        closing = true
        scope.launch {
            state.hide()
            onDismiss()
        }
    }
    Sheet(
        state,
        paneTitle = stringResource(R.string.recipe_add_title),
        onDismissRequest = onDismiss,
        locked = added || closing,
    ) {
        AddRecipeForm(
            onAdd = { url ->
                // The latch stops a double tap or a second Done from sending the link twice, and
                // nothing is sent once the sheet is on its way out. The initial show already
                // targets Expanded, so only a sheet settling to Hidden is refused.
                if (!added && !closing && state.targetValue != SheetValue.Hidden) {
                    added = true
                    onAdd(url)
                    close()
                }
            },
            onCancel = ::close,
        )
    }
}

/**
 * “Add a recipe” and its line of help, the Link field with its clear control, then Add recipe and
 * Cancel. The field waits for a tap before it takes focus and shows the keyboard, and doesn't read
 * the clipboard. Add recipe always looks enabled: it and the keyboard's Done do nothing while the
 * field is blank, and an address that can't be sent shows its reason under the field, which takes
 * focus, until the text changes. [onAdd] receives the link as [recipeLink] prepares it.
 */
@Composable
private fun AddRecipeForm(onAdd: (String) -> Unit, onCancel: () -> Unit) {
    val c = GohoTheme.colors
    val link = rememberTextFieldState()
    // The text a reason was given for, so editing it clears the reason.
    var rejected by remember { mutableStateOf<Pair<String, RecipeLink>?>(null) }
    val focus = remember { FocusRequester() }
    fun add() {
        val text = link.text.toString()
        when (val checked = recipeLink(text)) {
            RecipeLink.Blank -> Unit
            is RecipeLink.Valid -> onAdd(checked.url)
            RecipeLink.Invalid,
            RecipeLink.TooLong -> {
                rejected = text to checked
                focus.requestFocus()
            }
        }
    }
    val reason =
        rejected
            ?.takeIf { it.first == link.text.toString() }
            ?.let {
                stringResource(
                    if (it.second == RecipeLink.TooLong) R.string.recipe_link_too_long
                    else R.string.recipe_link_invalid
                )
            }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val label = stringResource(R.string.recipe_link)
    Column(
        Modifier.fillMaxWidth()
            .padding(horizontal = GohoSpacing.sheetPadding)
            .padding(top = GohoSpacing.sheetHeaderTop, bottom = GohoSpacing.sheetPadding)
    ) {
        Text(
            stringResource(R.string.recipe_add_title),
            style = GohoTheme.type.statusTitle,
            color = c.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            stringResource(R.string.recipe_add_body),
            style = GohoTheme.type.body,
            color = c.textSecondary,
            modifier = Modifier.padding(top = GohoSpacing.statusBodyTop),
        )
        // The visible label is decorative; the field carries the same name.
        Text(
            label,
            style = GohoTheme.type.meta,
            color = c.textSecondary,
            modifier =
                Modifier.padding(
                        top = GohoSpacing.sheetContentTop,
                        bottom = GohoSpacing.fieldLabelGap,
                    )
                    .clearAndSetSemantics {},
        )
        BasicTextField(
            state = link,
            modifier =
                Modifier.fillMaxWidth().focusRequester(focus).semantics {
                    contentDescription = label
                    if (reason != null) error(reason)
                },
            textStyle = GohoTheme.type.input.copy(color = c.textPrimary),
            lineLimits = TextFieldLineLimits.SingleLine,
            keyboardOptions =
                KeyboardOptions(
                    capitalization = KeyboardCapitalization.None,
                    autoCorrectEnabled = false,
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Done,
                ),
            onKeyboardAction = { add() },
            interactionSource = interaction,
            cursorBrush = SolidColor(c.accent),
            decorator = { input ->
                Row(
                    Modifier.heightIn(min = GohoSpacing.buttonHeight)
                        .clip(GohoShapes.field)
                        .background(c.surfaceMuted)
                        .border(
                            if (focused || reason != null) GohoSpacing.searchFocusRing
                            else GohoSpacing.hairline,
                            when {
                                reason != null -> c.attention
                                focused -> c.accent
                                else -> c.outline
                            },
                            GohoShapes.field,
                        )
                        .padding(start = GohoSpacing.fieldHorizontal),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.weight(1f)
                            .then(
                                if (link.text.isEmpty())
                                    Modifier.padding(end = GohoSpacing.fieldHorizontal)
                                else Modifier
                            )
                    ) {
                        input()
                    }
                    if (link.text.isNotEmpty())
                        ClearButton(stringResource(R.string.recipe_link_clear)) { link.clearText() }
                }
            },
        )
        if (reason != null)
            Text(
                reason,
                style = GohoTheme.type.meta,
                color = c.attention,
                modifier =
                    Modifier.padding(top = GohoSpacing.fieldErrorTop).semantics {
                        liveRegion = LiveRegionMode.Polite
                    },
            )
        Spacer(Modifier.height(GohoSpacing.sheetButtonsTop))
        ActionButton(
            stringResource(R.string.recipe_add),
            ::add,
            variant = 1,
            color = ButtonColor.Purple,
        )
        Spacer(Modifier.height(GohoSpacing.buttonGap))
        ActionButton(
            stringResource(R.string.recipe_cancel),
            onCancel,
            variant = 2,
            color = ButtonColor.Grey,
        )
    }
}
