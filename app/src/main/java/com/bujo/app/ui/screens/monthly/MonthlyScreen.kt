package com.bujo.app.ui.screens.monthly

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.DownloadForOffline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import com.bujo.app.ui.components.MonthCalendar
import com.bujo.app.ui.components.SectionHeader
import com.bujo.app.ui.components.formatJp
import com.bujo.app.ui.rememberEntrySheetController
import java.time.LocalDate

/**
 * マンスリーログ。左ページのカレンダーと右ページのタスク一覧、という
 * 紙のバレットジャーナルの見開きを縦に並べた形で再現している。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MonthlyScreen(
    viewModel: MonthlyViewModel,
    onOpenDay: (LocalDate) -> Unit,
    modifier: Modifier = Modifier
) {
    val month by viewModel.month.collectAsStateWithLifecycle()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val dayCounts by viewModel.dayCounts.collectAsStateWithLifecycle()
    val controller = rememberEntrySheetController()
    val snackbarHostState = remember { SnackbarHostState() }
    var showEditor by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.messages.collect { snackbarHostState.showSnackbar(it) }
    }

    Scaffold(
        modifier = modifier,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "マンスリーログ",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(text = month.formatJp(), style = MaterialTheme.typography.titleMedium)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { viewModel.shiftMonths(-1) }) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = "前の月")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.pullFutureLog() }) {
                        Icon(
                            Icons.Default.DownloadForOffline,
                            contentDescription = "フューチャーログから引き継ぐ"
                        )
                    }
                    IconButton(onClick = { viewModel.shiftMonths(1) }) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "次の月")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showEditor = true }) {
                Icon(Icons.Default.Add, contentDescription = "今月の項目を追加")
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = 96.dp)
        ) {
            item {
                MonthCalendar(
                    month = month,
                    onSelect = onOpenDay,
                    modifier = Modifier.padding(horizontal = 12.dp),
                    today = LocalDate.now(),
                    counts = dayCounts
                )
            }
            item {
                Text(
                    text = "日付をタップするとその日のデイリーログを開きます",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }
            item { HorizontalDivider(modifier = Modifier.fillMaxWidth()) }
            item {
                SectionHeader(
                    title = "今月のタスク・予定",
                    trailing = "月のうちに片付けたいこと。月末に見直して移動します。"
                )
            }
            if (entries.isEmpty()) {
                item {
                    EmptyState(
                        message = "今月の項目はまだありません",
                        hint = "＋ から月単位のタスクや予定を書き出しましょう"
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
            title = "${month.formatJp()}のマンスリーログに追加",
            onDismiss = { showEditor = false },
            onSave = { content, type, signifier, note ->
                viewModel.add(content, type, signifier, note)
                showEditor = false
            }
        )
    }

    EntrySheets(controller = controller, viewModel = viewModel)
}
