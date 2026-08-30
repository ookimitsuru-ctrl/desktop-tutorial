package com.bujo.app.ui.screens.migration

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Today
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bujo.app.ui.EntrySheets
import com.bujo.app.ui.components.EmptyState
import com.bujo.app.ui.components.EntryRow
import com.bujo.app.ui.components.formatShort
import com.bujo.app.ui.components.formatJp
import com.bujo.app.ui.rememberEntrySheetController
import java.time.LocalDate
import java.time.YearMonth

/** 移動（マイグレーション）: 過去に残った未完了タスクを一件ずつ見直す */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MigrationScreen(
    viewModel: MigrationViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val grouped by viewModel.grouped.collectAsStateWithLifecycle()
    val pending by viewModel.pending.collectAsStateWithLifecycle()
    val controller = rememberEntrySheetController()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "移動（マイグレーション）",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = "残り ${pending.size} 件",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                }
            )
        }
    ) { padding ->
        if (pending.isEmpty()) {
            EmptyState(
                message = "持ち越したタスクはありません",
                hint = "書き写す価値のあるものだけを次へ運ぶ——それがバレットジャーナルの移動です",
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            )
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = 32.dp)
        ) {
            item {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "一件ずつ問い直す: 今も価値があるか？ 今日やるか、先に送るか、やめるか。",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Row(
                        modifier = Modifier.padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(onClick = { viewModel.migrateAllToToday() }) {
                            Text("すべて今日へ")
                        }
                        OutlinedButton(onClick = { viewModel.migrateAllToThisMonth() }) {
                            Text("すべて今月へ")
                        }
                    }
                }
            }

            grouped.forEach { (source, entries) ->
                item(key = "header-$source") {
                    Text(
                        text = sourceLabel(source),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
                items(entries, key = { it.id }) { entry ->
                    EntryRow(
                        entry = entry,
                        onToggle = { viewModel.toggle(entry) },
                        onOpenActions = { controller.openActions(entry) },
                        trailing = {
                            IconButton(onClick = { viewModel.quickMigrateToToday(entry) }) {
                                Icon(Icons.Default.Today, contentDescription = "今日へ移動")
                            }
                        }
                    )
                }
            }
        }
    }

    EntrySheets(controller = controller, viewModel = viewModel)
}

private fun sourceLabel(source: String): String = runCatching {
    if (source.length > 7) LocalDate.parse(source).formatShort()
    else YearMonth.parse(source).formatJp() + "（マンスリー）"
}.getOrElse { source }
