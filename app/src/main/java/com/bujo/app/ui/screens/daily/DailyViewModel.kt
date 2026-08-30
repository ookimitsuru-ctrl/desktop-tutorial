package com.bujo.app.ui.screens.daily

import androidx.lifecycle.viewModelScope
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.Signifier
import com.bujo.app.data.repository.JournalRepository
import com.bujo.app.ui.BaseEntryViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class DailyViewModel(repository: JournalRepository) : BaseEntryViewModel(repository) {

    private val _date = MutableStateFlow(LocalDate.now())
    val date: StateFlow<LocalDate> = _date.asStateFlow()

    val entries: StateFlow<List<Entry>> = _date
        .flatMapLatest { repository.entriesForDay(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** 過去に残った未完了タスクの数（移動のお知らせ用） */
    val pendingMigrations: StateFlow<Int> = repository.pendingMigrationCount(LocalDate.now())
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)

    fun setDate(date: LocalDate) {
        _date.value = date
    }

    fun shiftDays(days: Long) {
        _date.value = _date.value.plusDays(days)
    }

    fun add(content: String, type: EntryType, signifier: Signifier, note: String?) =
        viewModelScope.launch {
            repository.addToDay(_date.value, content, type, signifier, note)
        }
}
