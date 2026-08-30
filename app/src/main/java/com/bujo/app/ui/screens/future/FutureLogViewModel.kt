package com.bujo.app.ui.screens.future

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
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth

/** フューチャーログ: これから先の月に置いておく予定とタスク */
@OptIn(ExperimentalCoroutinesApi::class)
class FutureLogViewModel(repository: JournalRepository) : BaseEntryViewModel(repository) {

    private val monthCount = 12

    /** 表示の起点となる月。標準は今月 */
    private val _startMonth = MutableStateFlow(YearMonth.now())
    val startMonth: StateFlow<YearMonth> = _startMonth.asStateFlow()

    val months: StateFlow<List<YearMonth>> = _startMonth
        .map { start -> monthsFrom(start) }
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            monthsFrom(YearMonth.now())
        )

    val entriesByMonth: StateFlow<Map<String, List<Entry>>> = _startMonth
        .flatMapLatest { repository.futureEntries(it, monthCount) }
        .map { entries -> entries.groupBy { it.monthKey.orEmpty() } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    private fun monthsFrom(start: YearMonth) = (0 until monthCount).map { start.plusMonths(it.toLong()) }

    fun shiftMonths(months: Long) {
        _startMonth.value = _startMonth.value.plusMonths(months)
    }

    fun resetToThisMonth() {
        _startMonth.value = YearMonth.now()
    }

    fun add(month: YearMonth, content: String, type: EntryType, signifier: Signifier, note: String?) =
        viewModelScope.launch {
            repository.addToFutureLog(month, content, type, signifier, note)
        }
}
