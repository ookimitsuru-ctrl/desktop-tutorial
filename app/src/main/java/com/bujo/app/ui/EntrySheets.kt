package com.bujo.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bujo.app.data.model.Entry
import com.bujo.app.ui.components.EntryActionsSheet
import com.bujo.app.ui.components.EntryEditorSheet

/** 操作メニューと編集シートの開閉状態 */
@Stable
class EntrySheetController {
    var actionTarget by mutableStateOf<Entry?>(null)
        private set
    var editTarget by mutableStateOf<Entry?>(null)
        private set

    fun openActions(entry: Entry) {
        actionTarget = entry
    }

    fun openEditor(entry: Entry) {
        actionTarget = null
        editTarget = entry
    }

    fun close() {
        actionTarget = null
        editTarget = null
    }
}

@Composable
fun rememberEntrySheetController(): EntrySheetController = remember { EntrySheetController() }

/**
 * 各画面で共通の「バレットを長押し/タップしたときのシート」をまとめて置く。
 */
@Composable
fun EntrySheets(controller: EntrySheetController, viewModel: BaseEntryViewModel) {
    val collections by viewModel.collections.collectAsStateWithLifecycle()

    controller.actionTarget?.let { entry ->
        EntryActionsSheet(
            entry = entry,
            collections = collections,
            onDismiss = controller::close,
            onEdit = { controller.openEditor(entry) },
            onDelete = {
                viewModel.delete(entry)
                controller.close()
            },
            onSetState = { state ->
                viewModel.setState(entry, state)
                controller.close()
            },
            onMigrateToDay = { date ->
                viewModel.migrateToDay(entry, date)
                controller.close()
            },
            onMigrateToMonth = { month ->
                viewModel.migrateToMonth(entry, month)
                controller.close()
            },
            onScheduleFuture = { month ->
                viewModel.scheduleToFuture(entry, month)
                controller.close()
            },
            onMigrateToCollection = { id ->
                viewModel.migrateToCollection(entry, id)
                controller.close()
            }
        )
    }

    controller.editTarget?.let { entry ->
        EntryEditorSheet(
            title = "バレットを編集",
            existing = entry,
            onDismiss = controller::close,
            onSave = { content, type, signifier, note ->
                viewModel.edit(entry, content, type, signifier, note)
                controller.close()
            }
        )
    }
}
