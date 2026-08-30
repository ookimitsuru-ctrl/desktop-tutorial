package com.bujo.app.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.TaskState

/**
 * ラピッドログの1行。
 * バレットをタップすると完了／未完了が切り替わり、本文をタップすると操作メニューが開く。
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun EntryRow(
    entry: Entry,
    onToggle: () -> Unit,
    onOpenActions: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null
) {
    val struck = entry.type == EntryType.TASK &&
        entry.state in setOf(TaskState.DONE, TaskState.CANCELLED)
    val dimmed = entry.type == EntryType.TASK && entry.state != TaskState.OPEN

    Row(
        modifier = modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onOpenActions, onLongClick = onOpenActions)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.Top
    ) {
        SignifierMark(entry.signifier)
        BulletMark(
            entry = entry,
            modifier = Modifier.clickable(enabled = entry.type == EntryType.TASK, onClick = onToggle)
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 4.dp, top = 3.dp)
        ) {
            Text(
                text = entry.content,
                style = MaterialTheme.typography.bodyLarge,
                textDecoration = if (struck) TextDecoration.LineThrough else null,
                color = if (dimmed) MaterialTheme.colorScheme.onSurfaceVariant
                else MaterialTheme.colorScheme.onSurface
            )
            entry.note?.let { note ->
                Text(
                    text = note,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
        }
        trailing?.invoke()
    }
}
