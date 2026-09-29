package com.example.mojiokoshi.ui.camera

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.util.Log
import android.util.Size
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.mojiokoshi.R
import java.io.File

/**
 * カメラのプレビューと撮影ボタンを表示する画面。
 * 撮影した画像、またはギャラリーで選んだ画像の [Uri] を [onImageReady] に渡す。
 */
@Composable
fun CameraScreen(onImageReady: (Uri) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var hasCameraPermission by remember { mutableStateOf(context.hasCameraPermission()) }
    var permissionRequested by rememberSaveable { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasCameraPermission = granted
        permissionRequested = true
    }
    val pickImageLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) onImageReady(uri) }
    val pickImage = {
        pickImageLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }

    // 設定アプリで権限を変更して戻ってきたときに反映する
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                hasCameraPermission = context.hasCameraPermission()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission && !permissionRequested) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    if (hasCameraPermission) {
        CameraContent(onImageCaptured = onImageReady, onPickImage = pickImage)
    } else {
        // 一度拒否され、再度ダイアログを出せない場合は設定アプリへ誘導する
        val permanentlyDenied = permissionRequested &&
            context.findActivity()?.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) == false
        PermissionContent(
            permanentlyDenied = permanentlyDenied,
            onRequestPermission = {
                if (permanentlyDenied) {
                    context.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
                    )
                } else {
                    permissionLauncher.launch(Manifest.permission.CAMERA)
                }
            },
            onPickImage = pickImage,
        )
    }
}

@Composable
private fun CameraContent(
    onImageCaptured: (Uri) -> Unit,
    onPickImage: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val hasFlash = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH) }

    var isCapturing by remember { mutableStateOf(false) }
    var isTorchOn by remember { mutableStateOf(false) }

    val cameraController = remember {
        LifecycleCameraController(context).apply {
            setEnabledUseCases(CameraController.IMAGE_CAPTURE)
            setImageCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            // プレビューと撮影画像の画角をそろえ、画面で見えている範囲を撮影する
            setPreviewResolutionSelector(
                ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .build(),
            )
            // 文字認識には約1200万画素あれば十分。高画素機での保存時間とメモリ消費を抑える
            setImageCaptureResolutionSelector(
                ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                    .setResolutionStrategy(
                        ResolutionStrategy(
                            Size(4032, 3024),
                            ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
                        ),
                    )
                    .build(),
            )
        }
    }

    DisposableEffect(lifecycleOwner) {
        cameraController.bindToLifecycle(lifecycleOwner)
        onDispose { cameraController.unbind() }
    }

    LightSystemBarIcons()

    fun capture() {
        if (isCapturing) return
        isCapturing = true
        val file = File(context.cacheDir, "capture.jpg")
        val options = ImageCapture.OutputFileOptions.Builder(file).build()
        cameraController.takePicture(
            options,
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    isCapturing = false
                    onImageCaptured(outputFileResults.savedUri ?: Uri.fromFile(file))
                }

                override fun onError(exception: ImageCaptureException) {
                    isCapturing = false
                    Log.w("CameraScreen", "Capture failed", exception)
                    Toast.makeText(context, R.string.error_capture, Toast.LENGTH_SHORT).show()
                }
            },
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        AndroidView(
            factory = { viewContext ->
                PreviewView(viewContext).apply {
                    scaleType = PreviewView.ScaleType.FIT_CENTER
                    controller = cameraController
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(16.dp),
                color = Color.Black.copy(alpha = 0.5f),
                contentColor = Color.White,
            ) {
                Text(
                    text = stringResource(R.string.camera_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
            if (hasFlash) {
                Spacer(Modifier.size(8.dp))
                IconButton(
                    onClick = {
                        isTorchOn = !isTorchOn
                        cameraController.enableTorch(isTorchOn)
                    },
                    colors = IconButtonDefaults.iconButtonColors(
                        containerColor = Color.Black.copy(alpha = 0.5f),
                        contentColor = if (isTorchOn) Color(0xFFFFD54F) else Color.White,
                    ),
                ) {
                    Icon(
                        painter = painterResource(if (isTorchOn) R.drawable.ic_flash_on else R.drawable.ic_flash_off),
                        contentDescription = stringResource(if (isTorchOn) R.string.torch_off else R.string.torch_on),
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 32.dp, vertical = 24.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilledIconButton(
                onClick = onPickImage,
                modifier = Modifier.size(56.dp),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = Color.White.copy(alpha = 0.2f),
                    contentColor = Color.White,
                ),
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_photo_library),
                    contentDescription = stringResource(R.string.pick_image),
                )
            }

            ShutterButton(isCapturing = isCapturing, onClick = { capture() })

            // シャッターボタンを中央に置くための余白
            Spacer(Modifier.size(56.dp))
        }
    }
}

@Composable
private fun ShutterButton(isCapturing: Boolean, onClick: () -> Unit) {
    val description = stringResource(R.string.capture)
    Box(
        modifier = Modifier
            .size(80.dp)
            .border(4.dp, Color.White, CircleShape)
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (isCapturing) {
            CircularProgressIndicator(color = Color.White)
        } else {
            FilledIconButton(
                onClick = onClick,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = Color.White,
                    contentColor = Color.Black,
                ),
            ) {
                Icon(
                    painter = painterResource(R.drawable.ic_photo_camera),
                    contentDescription = description,
                )
            }
        }
    }
}

@Composable
private fun PermissionContent(
    permanentlyDenied: Boolean,
    onRequestPermission: () -> Unit,
    onPickImage: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                painter = painterResource(R.drawable.ic_photo_camera),
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(24.dp))
            Text(
                text = stringResource(R.string.permission_title),
                style = MaterialTheme.typography.titleLarge,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = stringResource(
                    if (permanentlyDenied) R.string.permission_denied_message else R.string.permission_message,
                ),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(32.dp))
            Button(onClick = onRequestPermission, modifier = Modifier.fillMaxWidth()) {
                Text(
                    stringResource(
                        if (permanentlyDenied) R.string.permission_open_settings else R.string.permission_grant,
                    ),
                )
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onPickImage, modifier = Modifier.fillMaxWidth()) {
                Icon(
                    painter = painterResource(R.drawable.ic_photo_library),
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.pick_image))
            }
        }
    }
}

/** 黒背景のカメラ画面では、ステータスバーとナビゲーションバーのアイコンを白にする。 */
@Composable
private fun LightSystemBarIcons() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = view.context.findActivity()?.window ?: return@DisposableEffect onDispose {}
        val insetsController = WindowCompat.getInsetsController(window, view)
        val wasLightStatusBars = insetsController.isAppearanceLightStatusBars
        val wasLightNavigationBars = insetsController.isAppearanceLightNavigationBars
        insetsController.isAppearanceLightStatusBars = false
        insetsController.isAppearanceLightNavigationBars = false
        onDispose {
            insetsController.isAppearanceLightStatusBars = wasLightStatusBars
            insetsController.isAppearanceLightNavigationBars = wasLightNavigationBars
        }
    }
}

private fun Context.hasCameraPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
