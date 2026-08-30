package com.bujo.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.Today
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.JournalCollection
import com.bujo.app.data.model.TaskState
import java.time.LocalDate
import java.time.YearMonth

private enum class SubDialog { NONE, DAY, MONTH, FUTURE, COLLECTION }

/**
 * バレットに対する操作メニュー。
 * バレットジャーナルの「移動（マイグレーション）」をここに集約している。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryActionsSheet(
    entry: Entry,
    collections: List<JournalCollection>,
    onDismiss: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onSetState: (TaskState) -> Unit,
    onMigrateToDay: (LocalDate) -> Unit,
    onMigrateToMonth: (YearMonth) -> Unit,
    onScheduleFuture: (YearMonth) -> Unit,
    onMigrateToCollection: (Long) -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var dialog by remember { mutableStateOf(SubDialog.NONE) }
    val isTask = entry.type == EntryType.TASK

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp)
                .navigationBarsPadding()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BulletMark(entry)
                Text(
                    text = entry.content,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
            HorizontalDivider()

            if (isTask) {
                if (entry.state == TaskState.DONE) {
                    ActionRow(Icons.Default.Undo, "未完了に戻す") { onSetState(TaskState.OPEN) }
                } else {
                    ActionRow(Icons.Default.Check, "完了にする（✕）") { onSetState(TaskState.DONE) }
                }
                ActionRow(Icons.Default.Today, "今日へ移動（＞）") { onMigrateToDay(LocalDate.now()) }
                ActionRow(Icons.AutoMirrored.Filled.ArrowForward, "別の日へ移動（＞）") { dialog = SubDialog.DAY }
                ActionRow(Icons.Default.Event, "マンスリーログへ移動（＞）") { dialog = SubDialog.MONTH }
                ActionRow(Icons.Default.Event, "フューチャーログへ送る（＜）") { dialog = SubDialog.FUTURE }
                ActionRow(Icons.Default.Folder, "コレクションへ移動（＞）") { dialog = SubDialog.COLLECTION }
                ActionRow(Icons.Default.Block, "やらないと決める（〜）") { onSetState(TaskState.CANCELLED) }
            } else {
                ActionRow(Icons.AutoMirrored.Filled.ArrowForward, "別の日へ書き写す") { dialog = SubDialog.DAY }
                ActionRow(Icons.Default.Folder, "コレクションへ書き写す") { dialog = SubDialog.COLLECTION }
            }

            HorizontalDivider()
            ActionRow(Icons.Default.Edit, "編集", onClick = onEdit)
            ActionRow(Icons.Default.Delete, "削除", destructive = true, onClick = onDelete)
        }
    }

    when (dialog) {
        SubDialog.DAY -> DatePickerDialog(
            title = "移動先の日を選ぶ",
            initialDate = entry.localDate ?: LocalDate.now(),
            onDismiss = { dialog = SubDialog.NONE },
            onPick = { onMigrateToDay(it) }
        )

        SubDialog.MONTH -> MonthPickerDialog(
            title = "移動先の月を選ぶ",
            from = YearMonth.now(),
            count = 12,
            onDismiss = { dialog = SubDialog.NONE },
            onPick = { onMigrateToMonth(it) }
        )

        SubDialog.FUTURE -> MonthPickerDialog(
            title = "フューチャーログの月を選ぶ",
            from = YearMonth.now().plusMonths(1),
            count = 12,
            onDismiss = { dialog = SubDialog.NONE },
            onPick = { onScheduleFuture(it) }
        )

        SubDialog.COLLECTION -> CollectionPickerDialog(
            title = "コレクションを選ぶ",
            collections = collections.filterNot { it.archived },
            onDismiss = { dialog = SubDialog.NONE },
            onPick = { onMigrateToCollection(it.id) }
        )

        SubDialog.NONE -> Unit
    }
}

@Composable
private fun ActionRow(
    icon: ImageVector,
    label: String,
    destructive: Boolean = false,
    onClick: () -> Unit
) {
    val color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Icon(icon, contentDescription = null, tint = color)
        Text(label, style = MaterialTheme.typography.bodyLarge, color = color)
    }
}
