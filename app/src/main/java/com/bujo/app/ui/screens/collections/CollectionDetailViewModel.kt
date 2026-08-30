package com.bujo.app.ui.screens.collections

import androidx.lifecycle.viewModelScope
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.JournalCollection
import com.bujo.app.data.model.Signifier
import com.bujo.app.data.repository.JournalRepository
import com.bujo.app.ui.BaseEntryViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class CollectionDetailViewModel(
    repository: JournalRepository,
    private val collectionId: Long
) : BaseEntryViewModel(repository) {

    val collection: StateFlow<JournalCollection?> = repository.collection(collectionId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val entries: StateFlow<List<Entry>> = repository.entriesForCollection(collectionId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun add(content: String, type: EntryType, signifier: Signifier, note: String?) =
        viewModelScope.launch {
            repository.addToCollection(collectionId, content, type, signifier, note)
        }
}
