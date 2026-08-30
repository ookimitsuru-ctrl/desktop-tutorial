package com.bujo.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.bujo.app.data.model.JournalCollection
import java.time.LocalDate
import java.time.YearMonth

/** カレンダーから日付を選ぶダイアログ */
@Composable
fun DatePickerDialog(
    title: String,
    initialDate: LocalDate,
    onDismiss: () -> Unit,
    onPick: (LocalDate) -> Unit
) {
    var month by remember { mutableStateOf(YearMonth.from(initialDate)) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { month = month.minusMonths(1) }) {
                        Icon(Icons.Default.ChevronLeft, contentDescription = "前の月")
                    }
                    Text(month.formatJp(), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { month = month.plusMonths(1) }) {
                        Icon(Icons.Default.ChevronRight, contentDescription = "次の月")
                    }
                }
                MonthCalendar(month = month, selected = initialDate, onSelect = onPick)
            }
        },
        confirmButton = {
            TextButton(onClick = { onPick(LocalDate.now()) }) { Text("今日") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("キャンセル") } }
    )
}

/** 月を選ぶダイアログ（フューチャーログ行き先の指定など） */
@Composable
fun MonthPickerDialog(
    title: String,
    from: YearMonth = YearMonth.now(),
    count: Int = 12,
    onDismiss: () -> Unit,
    onPick: (YearMonth) -> Unit
) {
    val months = remember(from, count) { (0 until count).map { from.plusMonths(it.toLong()) } }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            LazyColumn(modifier = Modifier.heightIn(max = 360.dp)) {
                items(months) { month ->
                    Text(
                        text = month.formatJp(),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onPick(month) }
                            .padding(vertical = 14.dp, horizontal = 8.dp),
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("キャンセル") } }
    )
}

/** コレクションを選ぶダイアログ */
@Composable
fun CollectionPickerDialog(
    title: String,
    collections: List<JournalCollection>,
    onDismiss: () -> Unit,
    onPick: (JournalCollection) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            if (collections.isEmpty()) {
                Text("コレクションがまだありません。先に作成してください。")
            } else {
                LazyColumn(modifier = Modifier.heightIn(max = 360.dp)) {
                    items(collections) { collection ->
                        Text(
                            text = collection.title,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onPick(collection) }
                                .padding(vertical = 14.dp, horizontal = 8.dp),
                            style = MaterialTheme.typography.bodyLarge
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("閉じる") } }
    )
}

/** コレクションの新規作成 / 名前の変更 */
@Composable
fun CollectionEditDialog(
    initial: JournalCollection? = null,
    onDismiss: () -> Unit,
    onSave: (title: String, description: String?) -> Unit
) {
    var title by remember { mutableStateOf(initial?.title.orEmpty()) }
    var description by remember { mutableStateOf(initial?.description.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "コレクションを作る" else "コレクションを編集") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("タイトル") },
                    placeholder = { Text("読書リスト / 旅の計画 など") },
                    singleLine = true
                )
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("説明（任意）") },
                    maxLines = 3
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(title.trim(), description.trim().ifEmpty { null }) },
                enabled = title.isNotBlank()
            ) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("キャンセル") } }
    )
}
