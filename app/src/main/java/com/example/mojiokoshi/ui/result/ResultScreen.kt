package com.example.mojiokoshi.ui.result

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.mojiokoshi.OcrUiState
import com.example.mojiokoshi.R
import com.example.mojiokoshi.image
import com.example.mojiokoshi.ocr.RecognizedText
import com.example.mojiokoshi.ocr.TextFormatter
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ResultScreen(
    state: OcrUiState,
    onRetake: () -> Unit,
) {
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val recognized = (state as? OcrUiState.Result)?.text?.takeUnless { it.isEmpty }

    var joinLines by rememberSaveable { mutableStateOf(false) }
    // 読み取り結果や表示形式が変わったら、編集中のテキストを作り直す
    var editedText by rememberSaveable(recognized, joinLines) {
        mutableStateOf(recognized?.formatted(joinLines).orEmpty())
    }
    val copiedMessage = stringResource(R.string.copied)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.result_title)) },
                navigationIcon = {
                    IconButton(onClick = onRetake) {
                        Icon(
                            painter = painterResource(R.drawable.ic_arrow_back),
                            contentDescription = stringResource(R.string.retake),
                        )
                    }
                },
                actions = {
                    if (recognized != null) {
                        IconButton(onClick = { context.shareText(editedText) }) {
                            Icon(
                                painter = painterResource(R.drawable.ic_share),
                                contentDescription = stringResource(R.string.share),
                            )
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding)
                .imePadding(),
        ) {
            // テキスト編集中はキーボードの分だけ画像を隠して入力欄を広く使う
            val image = state.image
            AnimatedVisibility(visible = image != null && !WindowInsets.isImeVisible) {
                if (image != null) {
                    Image(
                        bitmap = image.asImageBitmap(),
                        contentDescription = stringResource(R.string.captured_image),
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(if (recognized != null) 200.dp else 320.dp)
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                    )
                }
            }

            when {
                state is OcrUiState.Processing -> ProcessingContent()
                recognized != null -> ResultContent(
                    text = editedText,
                    onTextChange = { editedText = it },
                    joinLines = joinLines,
                    onJoinLinesChange = { joinLines = it },
                    onRetake = onRetake,
                    onCopy = {
                        context.copyToClipboard(editedText)
                        // Android 13 以降はシステムがコピー完了を表示する
                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                            scope.launch { snackbarHostState.showSnackbar(copiedMessage) }
                        }
                    },
                )
                else -> MessageContent(
                    message = stringResource(
                        (state as? OcrUiState.Error)?.message ?: R.string.no_text_found,
                    ),
                    onRetake = onRetake,
                )
            }
        }
    }
}

@Composable
private fun ProcessingContent() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.processing), style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun ResultContent(
    text: String,
    onTextChange: (String) -> Unit,
    joinLines: Boolean,
    onJoinLinesChange: (Boolean) -> Unit,
    onRetake: () -> Unit,
    onCopy: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.char_count, TextFormatter.countCharacters(text)),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f),
            )
            FilterChip(
                selected = joinLines,
                onClick = { onJoinLinesChange(!joinLines) },
                label = { Text(stringResource(R.string.join_lines)) },
            )
        }

        OutlinedTextField(
            value = text,
            onValueChange = onTextChange,
            textStyle = MaterialTheme.typography.bodyLarge,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = onRetake, modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.retake))
            }
            Button(onClick = onCopy, enabled = text.isNotEmpty(), modifier = Modifier.weight(1f)) {
                Icon(
                    painter = painterResource(R.drawable.ic_content_copy),
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.copy))
            }
        }
    }
}

@Composable
private fun MessageContent(message: String, onRetake: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))
            Button(onClick = onRetake) {
                Text(stringResource(R.string.retake))
            }
        }
    }
}

private fun RecognizedText.formatted(joinLines: Boolean): String = if (joinLines) joined else raw

private fun Context.copyToClipboard(text: String) {
    val clipboard = getSystemService(ClipboardManager::class.java)
    clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.clip_label), text))
}

private fun Context.shareText(text: String) {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    startActivity(Intent.createChooser(send, getString(R.string.share)))
}
