package com.bujo.app.ui.screens.index

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
import androidx.compose.material.icons.filled.MoveDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bujo.app.ui.components.SectionHeader
import com.bujo.app.ui.components.formatJp
import java.time.YearMonth

/**
 * インデックス。紙のノートでいう巻頭の索引にあたり、
 * 記号の凡例（キー）と、月ごと・コレクションごとの入り口をまとめている。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IndexScreen(
    viewModel: IndexViewModel,
    onOpenMonth: (YearMonth) -> Unit,
    onOpenCollection: (Long) -> Unit,
    onOpenSearch: () -> Unit,
    onOpenMigration: () -> Unit,
    modifier: Modifier = Modifier
) {
    val months by viewModel.months.collectAsStateWithLifecycle()
    val collections by viewModel.collections.collectAsStateWithLifecycle()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("インデックス") },
                actions = {
                    IconButton(onClick = onOpenMigration) {
                        Icon(Icons.Default.MoveDown, contentDescription = "移動が必要なタスク")
                    }
                    IconButton(onClick = onOpenSearch) {
                        Icon(Icons.Default.Search, contentDescription = "検索")
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
            item { KeyCard() }
            item { SectionHeader(title = "月ごとの記録") }
            if (months.isEmpty()) {
                item {
                    Text(
                        text = "まだ記録がありません",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
            } else {
                items(months, key = { it.monthKey }) { summary ->
                    val month = runCatching { YearMonth.parse(summary.monthKey) }.getOrNull()
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = month != null) { month?.let(onOpenMonth) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = month?.formatJp() ?: summary.monthKey,
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Text(
                            text = "${summary.total} 件（未完了 ${summary.openTasks}）",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                }
            }

            item { SectionHeader(title = "コレクション") }
            if (collections.isEmpty()) {
                item {
                    Text(
                        text = "コレクションはまだありません",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
            } else {
                items(collections, key = { it.collection.id }) { summary ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenCollection(summary.collection.id) }
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(text = summary.collection.title, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            text = "${summary.total} 件（未完了 ${summary.openTasks}）",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                }
            }
        }
    }
}

/** 記号の凡例（キー） */
@Composable
private fun KeyCard() {
    Card(modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("キー（記号の意味）", style = MaterialTheme.typography.titleSmall)
            listOf(
                "•  タスク（やること）",
                "✕  完了したタスク",
                "＞  移動したタスク（別の日・マンスリー・コレクションへ）",
                "＜  フューチャーログへ送ったタスク",
                "〜  やらないと決めたタスク",
                "○  イベント（できごと・予定）",
                "—  メモ（覚えておきたいこと）",
                "*  優先　!  ひらめき　?  要調査"
            ).forEach {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
