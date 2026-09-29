package com.example.mojiokoshi.ocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import androidx.annotation.RequiresApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * 画像を向き（EXIF）を補正した Bitmap として読み込む。
 * メモリ不足を避けるため、長辺が [MAX_IMAGE_SIZE] を超える画像は縮小する。
 */
object ImageLoader {

    private const val MAX_IMAGE_SIZE = 4096

    suspend fun load(context: Context, uri: Uri): Bitmap = withContext(Dispatchers.IO) {
        val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            decodeWithImageDecoder(context, uri)
        } else {
            decodeWithBitmapFactory(context, uri)
        }
        // HDR 画像などで ARGB_8888 以外になることがあるため、OCR が扱える形式に揃える
        if (bitmap.config == Bitmap.Config.ARGB_8888) {
            bitmap
        } else {
            bitmap.copy(Bitmap.Config.ARGB_8888, false) ?: throw IOException("Cannot convert image: $uri")
        }
    }

    @RequiresApi(Build.VERSION_CODES.P)
    private fun decodeWithImageDecoder(context: Context, uri: Uri): Bitmap {
        val source = ImageDecoder.createSource(context.contentResolver, uri)
        // ImageDecoder は EXIF の向きを自動で反映する
        return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val width = info.size.width
            val height = info.size.height
            val longEdge = max(width, height)
            if (longEdge > MAX_IMAGE_SIZE) {
                val scale = MAX_IMAGE_SIZE.toFloat() / longEdge
                decoder.setTargetSize(
                    (width * scale).roundToInt().coerceAtLeast(1),
                    (height * scale).roundToInt().coerceAtLeast(1),
                )
            }
        }
    }

    private fun decodeWithBitmapFactory(context: Context, uri: Uri): Bitmap {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("Cannot decode image: $uri")

        var sampleSize = 1
        while (max(bounds.outWidth, bounds.outHeight) / sampleSize > MAX_IMAGE_SIZE) {
            sampleSize *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
            ?: throw IOException("Cannot decode image: $uri")

        val orientation = resolver.openInputStream(uri)?.use {
            ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } ?: ExifInterface.ORIENTATION_NORMAL
        return bitmap.applyExifOrientation(orientation)
    }

    private fun Bitmap.applyExifOrientation(orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.postRotate(90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.postRotate(270f)
                matrix.postScale(-1f, 1f)
            }
            else -> return this
        }
        val rotated = Bitmap.createBitmap(this, 0, 0, width, height, matrix, true)
        if (rotated !== this) recycle()
        return rotated
    }
}
