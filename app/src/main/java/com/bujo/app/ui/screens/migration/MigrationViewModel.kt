package com.bujo.app.ui.screens.migration

import androidx.lifecycle.viewModelScope
import com.bujo.app.data.model.Entry
import com.bujo.app.data.repository.JournalRepository
import com.bujo.app.ui.BaseEntryViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth

/**
 * マイグレーション（移動）の画面。
 * バレットジャーナルの中心にある習慣——「残ったタスクを一つずつ見直し、
 * 書き写す価値があるものだけを次に運ぶ」——を支える。
 */
class MigrationViewModel(repository: JournalRepository) : BaseEntryViewModel(repository) {

    private val today = LocalDate.now()

    val pending: StateFlow<List<Entry>> = repository.pendingMigrations(today)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** 出どころ（日付 / 月）ごとにまとめる */
    val grouped: StateFlow<Map<String, List<Entry>>> = repository.pendingMigrations(today)
        .map { entries -> entries.groupBy { it.date ?: it.monthKey.orEmpty() } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    fun migrateAllToToday() = viewModelScope.launch {
        pending.value.forEach { repository.migrateToDay(it, today) }
    }

    fun migrateAllToThisMonth() = viewModelScope.launch {
        val month = YearMonth.from(today)
        pending.value.forEach { repository.migrateToMonth(it, month) }
    }

    fun quickMigrateToToday(entry: Entry) = viewModelScope.launch {
        repository.migrateToDay(entry, today)
    }
}
