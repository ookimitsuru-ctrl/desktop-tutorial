package com.bujo.app.ui.screens.collections

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bujo.app.ui.EntrySheets
import com.bujo.app.ui.components.EmptyState
import com.bujo.app.ui.components.EntryEditorSheet
import com.bujo.app.ui.components.EntryRow
import com.bujo.app.ui.rememberEntrySheetController

/** コレクションの中身。ラピッドログと同じ記号でテーマ別に書き溜める。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionDetailScreen(
    viewModel: CollectionDetailViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val collection by viewModel.collection.collectAsStateWithLifecycle()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val controller = rememberEntrySheetController()
    var showEditor by remember { mutableStateOf(false) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text(collection?.title ?: "コレクション") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showEditor = true }) {
                Icon(Icons.Default.Add, contentDescription = "項目を追加")
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = 96.dp)
        ) {
            collection?.description?.let { description ->
                item {
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
            if (entries.isEmpty()) {
                item {
                    EmptyState(
                        message = "このコレクションは空です",
                        hint = "＋ から項目を書き足しましょう"
                    )
                }
            } else {
                items(entries, key = { it.id }) { entry ->
                    EntryRow(
                        entry = entry,
                        onToggle = { viewModel.toggle(entry) },
                        onOpenActions = { controller.openActions(entry) }
                    )
                }
            }
        }
    }

    if (showEditor) {
        EntryEditorSheet(
            title = "${collection?.title ?: "コレクション"} に追加",
            onDismiss = { showEditor = false },
            onSave = { content, type, signifier, note ->
                viewModel.add(content, type, signifier, note)
                showEditor = false
            }
        )
    }

    EntrySheets(controller = controller, viewModel = viewModel)
}
