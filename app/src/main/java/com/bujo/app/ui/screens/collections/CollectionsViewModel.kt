package com.bujo.app.ui.screens.collections

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bujo.app.data.local.CollectionSummary
import com.bujo.app.data.model.JournalCollection
import com.bujo.app.data.repository.JournalRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** コレクション一覧（テーマ別のまとめページ） */
class CollectionsViewModel(private val repository: JournalRepository) : ViewModel() {

    val summaries: StateFlow<List<CollectionSummary>> = repository.collectionSummaries()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun create(title: String, description: String?) = viewModelScope.launch {
        repository.createCollection(title, description)
    }

    fun rename(collection: JournalCollection, title: String, description: String?) =
        viewModelScope.launch {
            repository.updateCollection(collection.copy(title = title, description = description))
        }

    fun toggleArchive(collection: JournalCollection) = viewModelScope.launch {
        repository.updateCollection(collection.copy(archived = !collection.archived))
    }

    fun delete(collection: JournalCollection) = viewModelScope.launch {
        repository.deleteCollection(collection)
    }
}
