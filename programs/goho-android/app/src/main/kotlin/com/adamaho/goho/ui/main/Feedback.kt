package com.adamaho.goho.ui.main

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow

/** A background failure reported once its server outcome has been reconciled. */
internal sealed interface FeedbackMessage {
    data class DeletionFailed(val kind: DeletionKind) : FeedbackMessage

    /** Another book already has this title and [author]; Edit reopens the form with it. */
    data class AuthorConflict(val bookId: String, val author: String) : FeedbackMessage

    /** [author] wasn't saved; Try again sends it again. */
    data class AuthorFailed(val bookId: String, val author: String, val offline: Boolean) :
        FeedbackMessage
}

/**
 * The app's one queue of snackbar messages, owned by the activity so a failure still reaches the
 * shared snackbar after the sheet, overlay or details that started the request have left.
 */
internal class Feedback {
    private val queue = Channel<FeedbackMessage>(Channel.UNLIMITED)
    val messages = queue.receiveAsFlow()

    fun send(message: FeedbackMessage) {
        queue.trySend(message)
    }
}
