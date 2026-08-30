package com.bujo.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.JournalCollection

@Database(
    entities = [Entry::class, JournalCollection::class],
    version = 1,
    exportSchema = true
)
@TypeConverters(Converters::class)
abstract class JournalDatabase : RoomDatabase() {

    abstract fun journalDao(): JournalDao

    companion object {
        @Volatile
        private var instance: JournalDatabase? = null

        fun get(context: Context): JournalDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                JournalDatabase::class.java,
                "bujo.db"
            ).build().also { instance = it }
        }
    }
}
