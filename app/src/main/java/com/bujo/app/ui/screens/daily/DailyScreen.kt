package com.bujo.app.ui.screens.daily

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.TaskState
import com.bujo.app.ui.EntrySheets
import com.bujo.app.ui.components.DatePickerDialog
import com.bujo.app.ui.components.EmptyState
import com.bujo.app.ui.components.EntryEditorSheet
import com.bujo.app.ui.components.EntryRow
import com.bujo.app.ui.components.formatFull
import com.bujo.app.ui.components.relativeLabel
import com.bujo.app.ui.input.ShortcutAction
import com.bujo.app.ui.input.ShortcutHost
import com.bujo.app.ui.input.moveSelection
import com.bujo.app.ui.layout.LocalWindowSpec
import com.bujo.app.ui.rememberEntrySheetController
import java.time.LocalDate

/**
 * デイリーログ。1日の出来事・タスク・メモをその場で短く書き留める（ラピッドログ）。
 *
 * 物理キーボードのある端末では、J/K で行を選び、Space で完了、N で追加、
 * H/L で前後の日へ移動できる。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DailyScreen(
    viewModel: DailyViewModel,
    onOpenMigration: () -> Unit,
    onOpenSearch: () -> Unit,
    modifier: Modifier = Modifier
) {
    val date by viewModel.date.collectAsStateWithLifecycle()
    val entries by viewModel.entries.collectAsStateWithLifecycle()
    val pending by viewModel.pendingMigrations.collectAsStateWithLifecycle()
    val controller = rememberEntrySheetController()
    val window = LocalWindowSpec.current

    var showEditor by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var selected by remember { mutableIntStateOf(-1) }
    val listState = rememberLazyListState()

    val openCount = entries.count { it.isOpenTask }
    val doneCount = entries.count { it.type == EntryType.TASK && it.state == TaskState.DONE }
    val hasBanner = pending > 0

    // 選択が範囲外になったら外す（日付を切り替えたときなど）
    LaunchedEffect(entries.size) {
        if (selected >= entries.size) selected = -1
    }
    LaunchedEffect(selected) {
        if (selected >= 0) {
            listState.animateScrollToItem(selected + if (hasBanner) 1 else 0)
        }
    }

    val onShortcut: (ShortcutAction) -> Boolean = { action ->
        when (action) {
            ShortcutAction.NEW_ENTRY -> {
                showEditor = true; true
            }

            ShortcutAction.PREVIOUS_DAY -> {
                viewModel.shiftDays(-1); selected = -1; true
            }

            ShortcutAction.NEXT_DAY -> {
                viewModel.shiftDays(1); selected = -1; true
            }

            ShortcutAction.GO_TODAY -> {
                viewModel.setDate(LocalDate.now()); selected = -1; true
            }

            ShortcutAction.SELECT_NEXT -> {
                selected = moveSelection(selected, entries.size, 1); true
            }

            ShortcutAction.SELECT_PREVIOUS -> {
                selected = moveSelection(selected, entries.size, -1); true
            }

            ShortcutAction.TOGGLE_SELECTED -> {
                entries.getOrNull(selected)?.also { viewModel.toggle(it) } != null
            }

            ShortcutAction.OPEN_ACTIONS -> {
                entries.getOrNull(selected)?.also { controller.openActions(it) } != null
            }

            ShortcutAction.DISMISS -> {
                if (selected >= 0) {
                    selected = -1; true
                } else {
                    false
                }
            }

            else -> false
        }
    }

    ShortcutHost(
        onAction = onShortcut,
        modifier = modifier.fillMaxSize(),
        enabled = !showEditor && !showDatePicker && !controller.isOpen
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        val relative = relativeLabel(date)
                        if (window.isDense) {
                            // 縦が短い画面では1行に収める
                            Text(
                                text = listOfNotNull(relative, date.formatFull()).joinToString(" ・ "),
                                style = MaterialTheme.typography.titleSmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.clickable { showDatePicker = true }
                            )
                        } else {
                            Column(modifier = Modifier.clickable { showDatePicker = true }) {
                                Text(
                                    text = relative ?: "デイリーログ",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    text = date.formatFull(),
                                    style = MaterialTheme.typography.titleMedium
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = { viewModel.shiftDays(-1) }) {
                            Icon(Icons.Default.ChevronLeft, contentDescription = "前の日")
                        }
                    },
                    actions = {
                        IconButton(onClick = onOpenSearch) {
                            Icon(Icons.Default.Search, contentDescription = "検索")
                        }
                        IconButton(onClick = { viewModel.shiftDays(1) }) {
                            Icon(Icons.Default.ChevronRight, contentDescription = "次の日")
                        }
                    }
                )
            },
            floatingActionButton = {
                FloatingActionButton(onClick = { showEditor = true }) {
                    Icon(Icons.Default.Add, contentDescription = "バレットを追加")
                }
            }
        ) { padding ->
            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(bottom = 96.dp)
            ) {
                if (hasBanner) {
                    item {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "持ち越したタスクが ${pending} 件あります",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                TextButton(onClick = onOpenMigration) { Text("移動する") }
                            }
                        }
                    }
                }

                if (entries.isEmpty()) {
                    item {
                        EmptyState(
                            message = "まだ何も書かれていません",
                            hint = "＋ を押して、今日のタスク（•）・イベント（○）・メモ（—）を短く書き留めましょう"
                        )
                    }
                } else {
                    itemsIndexed(entries, key = { _, entry -> entry.id }) { index, entry ->
                        EntryRow(
                            entry = entry,
                            onToggle = { viewModel.toggle(entry) },
                            onOpenActions = {
                                selected = index
                                controller.openActions(entry)
                            },
                            selected = index == selected
                        )
                    }
                    item {
                        Text(
                            text = "未完了 ${openCount} ・ 完了 ${doneCount} ・ 全 ${entries.size} 件",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                }
            }
        }
    }

    if (showEditor) {
        EntryEditorSheet(
            title = "${date.formatFull()} に追加",
            onDismiss = { showEditor = false },
            onSave = { content, type, signifier, note ->
                viewModel.add(content, type, signifier, note)
                showEditor = false
            }
        )
    }

    if (showDatePicker) {
        DatePickerDialog(
            title = "日付を選ぶ",
            initialDate = date,
            onDismiss = { showDatePicker = false },
            onPick = { picked: LocalDate ->
                viewModel.setDate(picked)
                selected = -1
                showDatePicker = false
            }
        )
    }

    EntrySheets(controller = controller, viewModel = viewModel)
}
