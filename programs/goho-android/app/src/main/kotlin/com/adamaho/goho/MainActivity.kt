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
import com.adamaho.goho.api.generated.infrastructure.ApiClient
import com.adamaho.goho.api.generated.model.HealthData
import com.adamaho.goho.theme.GohoTheme
import com.adamaho.goho.ui.main.MainScreen
import com.adamaho.goho.ui.main.ServerConnectionStatus
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient

class MainActivity : ComponentActivity() {
    private var scannedImageUri by mutableStateOf<Uri?>(null)
    private var scanError by mutableStateOf<Int?>(null)
    private var isOpeningScanner by mutableStateOf(false)
    private var serverStatus by mutableStateOf(ServerConnectionStatus.Checking)

    private val healthApi by lazy {
        ApiClient(
                baseUrl = BuildConfig.GOHO_SERVER_URL,
                okHttpClientBuilder = OkHttpClient.Builder().callTimeout(5, TimeUnit.SECONDS),
            )
            .createService(HealthApi::class.java)
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
                        onScanClick = ::openScanner,
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
        if (isOpeningScanner) return

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
}
