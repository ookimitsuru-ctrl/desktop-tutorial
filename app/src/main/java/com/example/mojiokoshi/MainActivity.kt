package com.example.mojiokoshi

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.mojiokoshi.ui.camera.CameraScreen
import com.example.mojiokoshi.ui.result.ResultScreen
import com.example.mojiokoshi.ui.theme.MojiokoshiTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MojiokoshiTheme {
                MojiokoshiApp()
            }
        }
    }
}

@Composable
private fun MojiokoshiApp(viewModel: OcrViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    when (val state = uiState) {
        OcrUiState.Camera -> CameraScreen(onImageReady = viewModel::recognize)
        else -> {
            BackHandler(onBack = viewModel::backToCamera)
            ResultScreen(state = state, onRetake = viewModel::backToCamera)
        }
    }
}
