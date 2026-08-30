package com.bujo.app.ui.screens.future

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bujo.app.ui.EntrySheets
import com.bujo.app.ui.components.EntryEditorSheet
import com.bujo.app.ui.components.EntryRow
import com.bujo.app.ui.components.formatJp
import com.bujo.app.ui.rememberEntrySheetController
import java.time.YearMonth

/**
 * フューチャーログ。半年〜1年先までの予定を月ごとに置いておき、
 * その月になったらマンスリーログへ書き写す。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FutureLogScreen(
    viewModel: FutureLogViewModel,
    modifier: Modifier = Modifier
) {
    val months by viewModel.months.collectAsStateWithLifecycle()
    val entriesByMonth by viewModel.entriesByMonth.collectAsStateWithLifecycle()
    val startMonth by viewModel.startMonth.collectAsStateWithLifecycle()
    val controller = rememberEntrySheetController()
    var editorMonth by remember { mutableStateOf<YearMonth?>(null) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "フューチャーログ",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "${startMonth.formatJp()} から12か月",
                            style = MaterialTheme.typography.titleMedium
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { viewModel.shiftMonths(-6) }) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = "前の半年")
                    }
                },
                actions = {
                    TextButton(onClick = { viewModel.resetToThisMonth() }) { Text("今月") }
                    IconButton(onClick = { viewModel.shiftMonths(6) }) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "次の半年")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = 32.dp)
        ) {
            months.forEach { month ->
                val entries = entriesByMonth[month.toString()].orEmpty()
                item(key = "header-$month") {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clickable { editorMonth = month }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = month.formatJp(),
                            style = MaterialTheme.typography.titleSmall
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (entries.isNotEmpty()) {
                                Text(
                                    text = "${entries.size} 件",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { editorMonth = month }) {
                                Icon(Icons.Default.Add, contentDescription = "${month.formatJp()}に追加")
                            }
                        }
                    }
                }
                if (entries.isEmpty()) {
                    item(key = "empty-$month") {
                        Text(
                            text = "—",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 24.dp, top = 6.dp, bottom = 10.dp)
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
    }

    editorMonth?.let { month ->
        EntryEditorSheet(
            title = "${month.formatJp()}のフューチャーログに追加",
            onDismiss = { editorMonth = null },
            onSave = { content, type, signifier, note ->
                viewModel.add(month, content, type, signifier, note)
                editorMonth = null
            }
        )
    }

    EntrySheets(controller = controller, viewModel = viewModel)
}
