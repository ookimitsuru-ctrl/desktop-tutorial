package com.bujo.app.ui

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bujo.app.data.repository.JournalRepository
import com.bujo.app.ui.screens.collections.CollectionDetailViewModel
import com.bujo.app.ui.screens.collections.CollectionsViewModel
import com.bujo.app.ui.screens.daily.DailyViewModel
import com.bujo.app.ui.screens.future.FutureLogViewModel
import com.bujo.app.ui.screens.index.IndexViewModel
import com.bujo.app.ui.screens.migration.MigrationViewModel
import com.bujo.app.ui.screens.monthly.MonthlyViewModel
import com.bujo.app.ui.screens.search.SearchViewModel

/** 画面共通の ViewModel ファクトリ（DI ライブラリを使わない構成） */
fun bujoViewModelFactory(repository: JournalRepository): ViewModelProvider.Factory = viewModelFactory {
    initializer { DailyViewModel(repository) }
    initializer { MonthlyViewModel(repository) }
    initializer { FutureLogViewModel(repository) }
    initializer { CollectionsViewModel(repository) }
    initializer { IndexViewModel(repository) }
    initializer { SearchViewModel(repository) }
    initializer { MigrationViewModel(repository) }
}

/** コレクション詳細は id が必要なのでルートごとに作る */
fun collectionDetailFactory(
    repository: JournalRepository,
    collectionId: Long
): ViewModelProvider.Factory = viewModelFactory {
    initializer { CollectionDetailViewModel(repository, collectionId) }
}
