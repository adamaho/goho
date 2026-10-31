package com.adamaho.goho.ui.main

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import com.adamaho.goho.R
import com.adamaho.goho.theme.*
import com.adamaho.goho.ui.components.*

/** The options sheet's Add author pane, for a saved book without an author. */
@Composable
internal fun addAuthorForm(draft: String, onSave: (String) -> Unit): OptionsForm =
    OptionsForm(
        label = stringResource(R.string.book_add_author),
        icon = { modifier, color -> PlusIcon(modifier, color) },
    ) { close ->
        AuthorForm(draft, onSave, close)
    }

/**
 * Author’s name, then Save author and Cancel. Cancel, Back, a tap outside or a swipe down closes
 * the sheet without saving. The field waits for a tap before it takes focus and shows the keyboard.
 * Save always looks enabled, but it and the keyboard’s Done do nothing while the name is blank.
 * [onSave] receives the trimmed name, and the sheet closes at once while the save continues in the
 * background.
 */
@Composable
private fun AuthorForm(draft: String, onSave: (String) -> Unit, close: () -> Unit) {
    val c = GohoTheme.colors
    val name = rememberTextFieldState(draft)
    var saved by remember { mutableStateOf(false) }
    fun save() {
        if (name.text.isBlank() || saved) return
        saved = true
        onSave(name.text.toString().trim())
        close()
    }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val label = stringResource(R.string.book_author_name)
    Column(
        Modifier.fillMaxWidth()
            .padding(horizontal = GohoSpacing.sheetPadding)
            .padding(bottom = GohoSpacing.sheetPadding)
    ) {
        BasicTextField(
            state = name,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
            textStyle = GohoTheme.type.input.copy(color = c.textPrimary),
            lineLimits = TextFieldLineLimits.SingleLine,
            keyboardOptions =
                KeyboardOptions(
                    capitalization = KeyboardCapitalization.Words,
                    autoCorrectEnabled = false,
                    imeAction = ImeAction.Done,
                ),
            onKeyboardAction = { save() },
            interactionSource = interaction,
            cursorBrush = SolidColor(c.accent),
            decorator = { input ->
                Box(
                    Modifier.heightIn(min = GohoSpacing.buttonHeight)
                        .clip(GohoShapes.field)
                        .background(c.background)
                        .border(
                            if (focused) GohoSpacing.searchFocusRing else GohoSpacing.hairline,
                            if (focused) c.accent else c.outline,
                            GohoShapes.field,
                        )
                        .padding(horizontal = GohoSpacing.fieldHorizontal),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (name.text.isEmpty())
                        Text(
                            label,
                            style = GohoTheme.type.input,
                            color = c.textTertiary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    input()
                }
            },
        )
        Spacer(Modifier.height(GohoSpacing.sheetButtonsTop))
        ActionButton(
            stringResource(R.string.book_author_save),
            ::save,
            variant = 1,
            color = ButtonColor.Purple,
        )
        Spacer(Modifier.height(GohoSpacing.buttonGap))
        ActionButton(
            stringResource(R.string.book_cancel),
            close,
            variant = 2,
            color = ButtonColor.Grey,
        )
    }
}
