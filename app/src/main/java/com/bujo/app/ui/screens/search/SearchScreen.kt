package com.bujo.app.ui.screens.search

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.LogType
import com.bujo.app.ui.EntrySheets
import com.bujo.app.ui.components.EmptyState
import com.bujo.app.ui.components.EntryRow
import com.bujo.app.ui.components.formatJp
import com.bujo.app.ui.components.formatShort
import com.bujo.app.ui.rememberEntrySheetController
import java.time.LocalDate
import java.time.YearMonth

/** 全文検索。書いた場所（デイリー / マンスリー / フューチャー / コレクション）も表示する。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val query by viewModel.query.collectAsStateWithLifecycle()
    val results by viewModel.results.collectAsStateWithLifecycle()
    val titles by viewModel.collectionTitles.collectAsStateWithLifecycle()
    val controller = rememberEntrySheetController()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        withFrameNanos { }
        runCatching { focusRequester.requestFocus() }
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("検索") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = viewModel::onQueryChange,
                label = { Text("キーワード") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .focusRequester(focusRequester)
            )

            when {
                query.isBlank() -> EmptyState(
                    message = "書いたことを探す",
                    hint = "本文と補足メモの両方から探します"
                )

                results.isEmpty() -> EmptyState(message = "「$query」に一致する記録はありません")

                else -> LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
                    items(results, key = { it.id }) { entry ->
                        Column {
                            Text(
                                text = locationLabel(entry, titles),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 50.dp, top = 8.dp)
                            )
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
    }

    EntrySheets(controller = controller, viewModel = viewModel)
}

private fun locationLabel(entry: Entry, titles: Map<Long, String>): String = when (entry.logType) {
    LogType.DAILY -> entry.date?.let { runCatching { LocalDate.parse(it).formatShort() }.getOrDefault(it) }
        ?.let { "デイリーログ ・ $it" } ?: "デイリーログ"

    LogType.MONTHLY -> entry.monthKey
        ?.let { runCatching { YearMonth.parse(it).formatJp() }.getOrDefault(it) }
        ?.let { "マンスリーログ ・ $it" } ?: "マンスリーログ"

    LogType.FUTURE -> entry.monthKey
        ?.let { runCatching { YearMonth.parse(it).formatJp() }.getOrDefault(it) }
        ?.let { "フューチャーログ ・ $it" } ?: "フューチャーログ"

    LogType.COLLECTION -> "コレクション ・ " + (titles[entry.collectionId] ?: "—")
}
