package com.bujo.app.ui.screens.collections

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Unarchive
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bujo.app.data.model.JournalCollection
import com.bujo.app.ui.components.CollectionEditDialog
import com.bujo.app.ui.components.EmptyState

/** コレクション一覧: 読書リスト、旅の計画、習慣トラッカーなど自由なまとめページ */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CollectionsScreen(
    viewModel: CollectionsViewModel,
    onOpenCollection: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val summaries by viewModel.summaries.collectAsStateWithLifecycle()
    var showCreate by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<JournalCollection?>(null) }

    Scaffold(
        modifier = modifier,
        topBar = { TopAppBar(title = { Text("コレクション") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreate = true }) {
                Icon(Icons.Default.Add, contentDescription = "コレクションを作る")
            }
        }
    ) { padding ->
        if (summaries.isEmpty()) {
            EmptyState(
                message = "コレクションはまだありません",
                hint = "「読みたい本」「旅の準備」など、テーマごとのページを作れます",
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            )
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(bottom = 96.dp)
            ) {
                items(summaries, key = { it.collection.id }) { summary ->
                    var menuOpen by remember { mutableStateOf(false) }
                    val collection = summary.collection
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenCollection(collection.id) }
                            .padding(start = 16.dp, top = 12.dp, bottom = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = collection.title,
                                style = MaterialTheme.typography.titleSmall,
                                textDecoration = if (collection.archived) TextDecoration.LineThrough else null
                            )
                            collection.description?.let {
                                Text(
                                    text = it,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Text(
                                text = "全 ${summary.total} 件 ・ 未完了 ${summary.openTasks} 件",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Box {
                            IconButton(onClick = { menuOpen = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = "操作")
                            }
                            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                DropdownMenuItem(
                                    text = { Text("名前を変える") },
                                    leadingIcon = { Icon(Icons.Default.Edit, null) },
                                    onClick = {
                                        menuOpen = false
                                        editing = collection
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(if (collection.archived) "元に戻す" else "アーカイブ") },
                                    leadingIcon = {
                                        Icon(
                                            if (collection.archived) Icons.Default.Unarchive
                                            else Icons.Default.Archive,
                                            null
                                        )
                                    },
                                    onClick = {
                                        menuOpen = false
                                        viewModel.toggleArchive(collection)
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("削除") },
                                    leadingIcon = { Icon(Icons.Default.Delete, null) },
                                    onClick = {
                                        menuOpen = false
                                        viewModel.delete(collection)
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (showCreate) {
        CollectionEditDialog(
            onDismiss = { showCreate = false },
            onSave = { title, description ->
                viewModel.create(title, description)
                showCreate = false
            }
        )
    }

    editing?.let { collection ->
        CollectionEditDialog(
            initial = collection,
            onDismiss = { editing = null },
            onSave = { title, description ->
                viewModel.rename(collection, title, description)
                editing = null
            }
        )
    }
}
