package com.bujo.app.ui.screens.monthly

import androidx.lifecycle.viewModelScope
import com.bujo.app.data.local.DayCount
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.Signifier
import com.bujo.app.data.repository.JournalRepository
import com.bujo.app.ui.BaseEntryViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth

@OptIn(ExperimentalCoroutinesApi::class)
class MonthlyViewModel(repository: JournalRepository) : BaseEntryViewModel(repository) {

    private val _month = MutableStateFlow(YearMonth.now())
    val month: StateFlow<YearMonth> = _month.asStateFlow()

    private val _messages = MutableSharedFlow<String>()
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    val entries: StateFlow<List<Entry>> = _month
        .flatMapLatest { repository.entriesForMonthlyLog(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val dayCounts: StateFlow<Map<String, DayCount>> = _month
        .flatMapLatest { repository.dayCounts(it) }
        .map { list -> list.associateBy { it.date } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    fun setMonth(month: YearMonth) {
        _month.value = month
    }

    fun shiftMonths(months: Long) {
        _month.value = _month.value.plusMonths(months)
    }

    fun add(content: String, type: EntryType, signifier: Signifier, note: String?) =
        viewModelScope.launch {
            repository.addToMonthlyLog(_month.value, content, type, signifier, note)
        }

    /** 月初のセットアップ: フューチャーログの内容をこの月へ書き写す */
    fun pullFutureLog() = viewModelScope.launch {
        val moved = repository.pullFutureLogInto(_month.value)
        _messages.emit(
            if (moved == 0) "フューチャーログに引き継ぐ項目はありません"
            else "フューチャーログから ${moved} 件を書き写しました"
        )
    }
}
