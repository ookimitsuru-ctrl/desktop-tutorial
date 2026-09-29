package com.example.mojiokoshi

import android.app.Application
import android.net.Uri
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mojiokoshi.ocr.ImageLoader
import com.example.mojiokoshi.ocr.RecognizedText
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class OcrViewModel(application: Application) : AndroidViewModel(application) {

    // 日本語モデルは英数字（ラテン文字）も認識できる
    private val recognizer = TextRecognition.getClient(JapaneseTextRecognizerOptions.Builder().build())

    private val _uiState = MutableStateFlow<OcrUiState>(OcrUiState.Camera)
    val uiState: StateFlow<OcrUiState> = _uiState.asStateFlow()

    private var recognitionJob: Job? = null

    /** 撮影した画像またはギャラリーで選んだ画像から文字を読み取る。 */
    fun recognize(uri: Uri) {
        recognitionJob?.cancel()
        _uiState.value = OcrUiState.Processing(image = null)
        recognitionJob = viewModelScope.launch {
            val image = try {
                ImageLoader.load(getApplication(), uri)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Failed to load image: $uri", e)
                _uiState.value = OcrUiState.Error(image = null, message = R.string.error_load_image)
                return@launch
            }

            _uiState.value = OcrUiState.Processing(image)
            _uiState.value = try {
                val text = recognizer.process(InputImage.fromBitmap(image, 0)).await()
                OcrUiState.Result(image, RecognizedText.from(text))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Text recognition failed", e)
                OcrUiState.Error(image, R.string.error_recognition)
            }
        }
    }

    fun backToCamera() {
        recognitionJob?.cancel()
        recognitionJob = null
        _uiState.value = OcrUiState.Camera
    }

    override fun onCleared() {
        recognizer.close()
    }

    private companion object {
        const val TAG = "OcrViewModel"
    }
}
