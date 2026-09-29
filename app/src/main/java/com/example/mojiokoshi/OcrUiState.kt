package com.example.mojiokoshi

import android.graphics.Bitmap
import androidx.annotation.StringRes
import com.example.mojiokoshi.ocr.RecognizedText

sealed interface OcrUiState {
    /** カメラで撮影を待っている状態 */
    data object Camera : OcrUiState

    /** 画像の読み込み・文字認識中。[image] は読み込みが終わるまで null */
    data class Processing(val image: Bitmap?) : OcrUiState

    data class Result(val image: Bitmap, val text: RecognizedText) : OcrUiState

    data class Error(val image: Bitmap?, @StringRes val message: Int) : OcrUiState
}

val OcrUiState.image: Bitmap?
    get() = when (this) {
        OcrUiState.Camera -> null
        is OcrUiState.Processing -> image
        is OcrUiState.Result -> image
        is OcrUiState.Error -> image
    }
