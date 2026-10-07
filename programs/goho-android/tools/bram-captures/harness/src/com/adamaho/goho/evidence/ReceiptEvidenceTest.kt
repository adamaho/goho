package com.adamaho.goho.evidence

import android.provider.Settings
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.adamaho.goho.api.generated.model.Receipt
import com.adamaho.goho.api.generated.model.ReceiptUploadsList200ResponseDataInner
import com.adamaho.goho.theme.GohoTheme
import com.adamaho.goho.ui.main.ReceiptOverview
import com.adamaho.goho.ui.main.ReceiptOverviewState
import com.github.takahirom.roborazzi.captureRoboImage
import java.io.File
import java.time.Instant
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w360dp-h800dp-xhdpi")
class ReceiptEvidenceTest {
    @get:Rule val compose = createComposeRule()
    private val saved = Receipt("1", "Family groceries", "2026-10-04", "Groceries", "10", "1.30", "11.30", "CAD", emptyList())
    private val output = File(System.getProperty("goho.evidence.output")).apply { mkdirs() }
    private val state = mutableStateOf(ReceiptOverviewState(hasLoaded = true))

    private fun render(initial: ReceiptOverviewState, reduced: Boolean = true) {
        state.value = initial
        Settings.Global.putFloat(RuntimeEnvironment.getApplication().contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, if (reduced) 0f else 1f)
        compose.setContent {
            GohoTheme {
                ReceiptOverview(
                    state = state.value,
                    isOpeningScanner = false,
                    scanError = null,
                    onScanClick = {},
                    onRetryClick = { state.value = state.value.copy(loading = true) },
                    onReceiptClick = {},
                    loadReceiptImage = { null },
                    modifier = Modifier.fillMaxSize(),
                    previewTime = Instant.parse("2026-10-04T16:00:00Z"),
                    deleteReceipt = { entry ->
                        state.value = state.value.copy(uploads = state.value.uploads.filterNot { it.id == entry.uploadId })
                        true
                    },
                )
            }
        }
        compose.waitForIdle()
    }
    private fun capture(name: String) {
        compose.waitForIdle()
        compose.onRoot().captureRoboImage(File(output, "$name.png").absolutePath)
        File(output, "$name-semantics.txt").writeText(compose.onRoot(useUnmergedTree = true).printToString())
    }
    private fun empty(name: String) { render(ReceiptOverviewState(hasLoaded = true)); capture(name) }
    private fun attention(name: String) {
        render(ReceiptOverviewState(receipts = listOf(saved), hasLoaded = true))
        compose.onNodeWithText("Needs attention").performClick()
        compose.onNodeWithText("Nothing needs attention").assertExists()
        capture(name)
    }
    private fun error(name: String) { render(ReceiptOverviewState(error = true)); capture(name) }

    @Test fun noReceiptsLight() = empty("no-receipts-light")
    @Test @Config(qualifiers = "+night") fun noReceiptsDark() = empty("no-receipts-dark")
    @Test fun noAttentionLight() = attention("no-attention-light")
    @Test @Config(qualifiers = "+night") fun noAttentionDark() = attention("no-attention-dark")
    @Test fun loadErrorLight() = error("load-error-light")
    @Test @Config(qualifiers = "+night") fun loadErrorDark() = error("load-error-dark")
    @Test @Config(qualifiers = "w360dp-h640dp-xhdpi") fun smallEmpty() = empty("small-360-no-receipts")
    @Test @Config(qualifiers = "w412dp-h960dp-xhdpi") fun tallEmpty() = empty("tall-no-receipts")
    @Test @Config(qualifiers = "w360dp-h640dp-xhdpi") fun largeTextEmpty() {
        RuntimeEnvironment.setFontScale(2f)
        empty("large-font-no-receipts")
        compose.onNodeWithText("Scan", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Tap Scan to add your first one.", useUnmergedTree = true).performScrollTo().assertIsDisplayed()
        capture("large-font-no-receipts-scrolled")
    }
    @Test @Config(qualifiers = "w360dp-h640dp-xhdpi") fun largeTextError() {
        RuntimeEnvironment.setFontScale(2f)
        error("large-font-load-error")
        compose.onNodeWithText("Try again").performScrollTo().assertIsDisplayed()
        capture("large-font-load-error-scrolled")
    }
    @Test @Config(qualifiers = "w360dp-h640dp-xhdpi") fun largeTextAttention() {
        RuntimeEnvironment.setFontScale(2f)
        attention("large-font-no-attention")
        compose.onNodeWithText("Scan", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Receipts that couldn’t be processed will show up here.", useUnmergedTree = true).performScrollTo().assertIsDisplayed()
        capture("large-font-no-attention-scrolled")
    }
    private fun deleteLast(withSaved: Boolean, name: String) {
        assumeTrue(output.name == "after")
        val failed = ReceiptUploadsList200ResponseDataInner(
            UUID.fromString("00000000-0000-4000-8000-000000000001"),
            "receipt.jpg", ReceiptUploadsList200ResponseDataInner.ContentType.imageSlashJpeg,
            ReceiptUploadsList200ResponseDataInner.Status.failed, null,
            ReceiptUploadsList200ResponseDataInner.FailureCode.processing_failed,
            "2026-10-04T14:30:00Z", "2026-10-04T14:30:00Z",
        )
        render(ReceiptOverviewState(uploads = listOf(failed), receipts = if (withSaved) listOf(saved) else emptyList(), hasLoaded = true))
        compose.onNodeWithText("Needs attention").performClick()
        compose.onNodeWithText("Not processed").performClick()
        compose.onNodeWithText("Delete receipt").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Delete receipt").performClick()
        compose.waitForIdle()
        compose.onNodeWithText("Nothing needs attention").assertIsDisplayed()
        compose.onNodeWithText("Needs attention").assertIsSelected()
        compose.onNodeWithText("Needs attention").assertTextEquals("Needs attention")
        compose.onNodeWithText("Scan", useUnmergedTree = true).assertIsDisplayed()
        capture(name)
    }
    @Test fun deleteLastFailedWithSavedReceipt() = deleteLast(true, "deleted-last-failed-with-saved")
    @Test fun deleteLastFailedOverall() = deleteLast(false, "deleted-last-failed-overall")
    @Test @Config(qualifiers = "+night") fun deleteLastFailedDark() = deleteLast(false, "deleted-last-failed-dark")
    @Test fun reducedMotionStaysStatic() {
        assumeTrue(output.name == "after")
        compose.mainClock.autoAdvance = false
        render(ReceiptOverviewState(error = true), reduced = true)
        compose.onNodeWithText("Couldn’t load receipts").assertIsDisplayed()
        val initial = File(output, "reduced-motion-initial.png")
        val later = File(output, "reduced-motion-later.png")
        val pressed = File(output, "reduced-motion-pressed.png")
        compose.onRoot().captureRoboImage(initial.absolutePath)
        compose.mainClock.advanceTimeBy(1000)
        compose.waitForIdle()
        compose.onRoot().captureRoboImage(later.absolutePath)
        assertTrue("Reduced-motion entrance must be static", initial.readBytes().contentEquals(later.readBytes()))
        val button = compose.onNodeWithText("Try again")
        val bounds = button.fetchSemanticsNode().boundsInRoot
        button.performTouchInput { down(center) }
        compose.mainClock.advanceTimeBy(1000)
        compose.waitForIdle()
        assertEquals(bounds, button.fetchSemanticsNode().boundsInRoot)
        compose.onRoot().captureRoboImage(pressed.absolutePath)
        assertTrue("Reduced-motion press must be static", later.readBytes().contentEquals(pressed.readBytes()))
        button.performTouchInput { up() }
        compose.mainClock.autoAdvance = true
    }
    @Test fun retryFailureAndSuccess() {
        render(ReceiptOverviewState(error = true), reduced = false)
        val title = "Couldn’t load receipts"
        compose.mainClock.advanceTimeBy(1000)
        val before = compose.onNodeWithText(title).fetchSemanticsNode().boundsInRoot
        compose.onNodeWithText("Try again").performClick()
        compose.onNodeWithText("Trying again…").assertIsNotEnabled()
        assertEquals(before, compose.onNodeWithText(title).fetchSemanticsNode().boundsInRoot)
        capture("retry-running")
        compose.runOnIdle { state.value = state.value.copy(loading = false) }
        compose.mainClock.advanceTimeBy(1000)
        assertEquals(before, compose.onNodeWithText(title).fetchSemanticsNode().boundsInRoot)
        capture("retry-failed")
        compose.onNodeWithText("Try again").performClick()
        compose.runOnIdle { state.value = ReceiptOverviewState(receipts = listOf(saved), hasLoaded = true) }
        compose.mainClock.advanceTimeBy(1000)
        compose.onNodeWithText("Family groceries").assertIsDisplayed()
        compose.onNodeWithText(title).assertDoesNotExist()
        capture("retry-succeeded")
    }
}
