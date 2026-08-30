package com.bujo.app.di

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.bujo.app.BujoApplication
import com.bujo.app.data.local.JournalDatabase
import com.bujo.app.data.repository.JournalRepository

/** Hilt を使わない小さな手書き DI コンテナ */
class AppContainer(context: Context) {
    private val database = JournalDatabase.get(context)
    val repository: JournalRepository by lazy { JournalRepository(database.journalDao()) }
}

/** Composable から リポジトリ を取り出すヘルパー */
@Composable
fun rememberRepository(): JournalRepository {
    val context = LocalContext.current
    return (context.applicationContext as BujoApplication).container.repository
}
