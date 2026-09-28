package com.adamaho.goho

import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.adamaho.goho.api.generated.HealthApi
import com.adamaho.goho.api.generated.ReceiptUploadsApi
import com.adamaho.goho.api.generated.infrastructure.ApiClient
import com.adamaho.goho.api.generated.model.HealthData
import com.adamaho.goho.api.generated.model.ReceiptUploadsCreate202ResponseData
import com.adamaho.goho.theme.GohoTheme
import com.adamaho.goho.ui.main.MainScreen
import com.adamaho.goho.ui.main.ServerConnectionStatus
import com.adamaho.goho.ui.main.UploadStatus
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okio.BufferedSink

class MainActivity : ComponentActivity() {
    private var scannedImageUri by mutableStateOf<Uri?>(null)
    private var scanError by mutableStateOf<Int?>(null)
    private var isOpeningScanner by mutableStateOf(false)
    private var serverStatus by mutableStateOf(ServerConnectionStatus.Checking)
    private var uploadStatus by mutableStateOf(UploadStatus.Ready)

    private val healthApi by lazy {
        ApiClient(
                baseUrl = BuildConfig.GOHO_SERVER_URL,
                okHttpClientBuilder = OkHttpClient.Builder().callTimeout(5, TimeUnit.SECONDS),
            )
            .createService(HealthApi::class.java)
    }

    private val receiptUploadsApi by lazy {
        ApiClient(
                baseUrl = BuildConfig.GOHO_SERVER_URL,
                okHttpClientBuilder = OkHttpClient.Builder().callTimeout(60, TimeUnit.SECONDS),
            )
            .createService(ReceiptUploadsApi::class.java)
    }

    private val scannerLauncher =
        registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
            if (result.resultCode == RESULT_OK) {
                val imageUri =
                    GmsDocumentScanningResult.fromActivityResultIntent(result.data)
                        ?.pages
                        ?.firstOrNull()
                        ?.imageUri
                if (imageUri != null) {
                    scannedImageUri = imageUri
                    scanError = null
                    uploadStatus = UploadStatus.Ready
                } else {
                    scanError = R.string.scan_no_image
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()
        setContent {
            GohoTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    MainScreen(
                        scannedImageUri = scannedImageUri,
                        isOpeningScanner = isOpeningScanner,
                        scanError = scanError,
                        serverStatus = serverStatus,
                        uploadStatus = uploadStatus,
                        onScanClick = ::openScanner,
                        onUploadClick = ::uploadReceipt,
                        onRetryServerClick = ::checkServer,
                    )
                }
            }
        }
        checkServer()
    }

    private fun checkServer() {
        serverStatus = ServerConnectionStatus.Checking
        lifecycleScope.launch {
            serverStatus =
                try {
                    val response = healthApi.healthCheck()
                    if (
                        response.isSuccessful &&
                            response.body()?.data?.status == HealthData.Status.ok
                    ) {
                        ServerConnectionStatus.Connected
                    } else {
                        ServerConnectionStatus.Unavailable
                    }
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    Log.w("GohoServer", "Health check failed", error)
                    ServerConnectionStatus.Unavailable
                }
        }
    }

    private fun openScanner() {
        if (isOpeningScanner || uploadStatus == UploadStatus.Uploading) return

        isOpeningScanner = true
        scanError = null
        val options =
            GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(false)
                .setPageLimit(1)
                .setResultFormats(RESULT_FORMAT_JPEG)
                .setScannerMode(SCANNER_MODE_FULL)
                .build()

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(this)
            .addOnSuccessListener { intentSender ->
                isOpeningScanner = false
                scannerLauncher.launch(IntentSenderRequest.Builder(intentSender).build())
            }
            .addOnFailureListener { error ->
                isOpeningScanner = false
                scanError = R.string.scan_failed
                Log.e("GohoScanner", "Could not open document scanner", error)
            }
    }

    private fun uploadReceipt() {
        val imageUri = scannedImageUri ?: return
        if (
            isOpeningScanner ||
                uploadStatus == UploadStatus.Uploading ||
                uploadStatus == UploadStatus.Submitted
        )
            return

        uploadStatus = UploadStatus.Uploading
        val body =
            object : RequestBody() {
                override fun contentType() = "image/jpeg".toMediaType()

                override fun isOneShot() = true

                override fun writeTo(sink: BufferedSink) {
                    val input =
                        contentResolver.openInputStream(imageUri)
                            ?: throw IOException("Scanned receipt image is unavailable")
                    input.use { it.copyTo(sink.outputStream()) }
                }
            }
        val file = MultipartBody.Part.createFormData("file", "receipt.jpg", body)
        lifecycleScope.launch {
            uploadStatus =
                try {
                    val response = receiptUploadsApi.receiptUploadsCreate(file)
                    val status = response.body()?.data?.status
                    if (
                        response.code() == 202 &&
                            status != null &&
                            status != ReceiptUploadsCreate202ResponseData.Status.failed
                    ) {
                        UploadStatus.Submitted
                    } else {
                        UploadStatus.Failed
                    }
                } catch (error: Exception) {
                    if (error is CancellationException) throw error
                    Log.w("GohoUpload", "Receipt upload failed", error)
                    UploadStatus.Failed
                }
        }
    }
}
