package com.bujo.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.JournalCollection
import com.bujo.app.data.model.Signifier
import com.bujo.app.data.model.TaskState
import com.bujo.app.data.repository.JournalRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/**
 * どの画面のバレットにも共通する操作（完了・移動・編集・削除）をまとめた基底クラス。
 */
abstract class BaseEntryViewModel(protected val repository: JournalRepository) : ViewModel() {

    val collections: StateFlow<List<JournalCollection>> = repository.collections()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun toggle(entry: Entry) = viewModelScope.launch { repository.toggleTask(entry) }

    fun setState(entry: Entry, state: TaskState) =
        viewModelScope.launch { repository.setState(entry, state) }

    fun migrateToDay(entry: Entry, date: LocalDate) =
        viewModelScope.launch { repository.migrateToDay(entry, date) }

    fun migrateToMonth(entry: Entry, month: YearMonth) =
        viewModelScope.launch { repository.migrateToMonth(entry, month) }

    fun scheduleToFuture(entry: Entry, month: YearMonth) =
        viewModelScope.launch { repository.scheduleToFuture(entry, month) }

    fun migrateToCollection(entry: Entry, collectionId: Long) =
        viewModelScope.launch { repository.migrateToCollection(entry, collectionId) }

    fun delete(entry: Entry) = viewModelScope.launch { repository.deleteEntry(entry) }

    fun edit(
        entry: Entry,
        content: String,
        type: EntryType,
        signifier: Signifier,
        note: String?
    ) = viewModelScope.launch {
        repository.updateEntry(
            entry.copy(content = content, type = type, signifier = signifier, note = note)
        )
    }
}
