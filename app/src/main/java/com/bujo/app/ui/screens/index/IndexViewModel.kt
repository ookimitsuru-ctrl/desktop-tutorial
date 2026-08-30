package com.bujo.app.ui.screens.index

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bujo.app.data.local.CollectionSummary
import com.bujo.app.data.local.MonthSummary
import com.bujo.app.data.repository.JournalRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn

/** インデックス（索引）: どこに何を書いたかを一覧する */
class IndexViewModel(repository: JournalRepository) : ViewModel() {

    val months: StateFlow<List<MonthSummary>> = repository.monthSummaries()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val collections: StateFlow<List<CollectionSummary>> = repository.collectionSummaries()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}
