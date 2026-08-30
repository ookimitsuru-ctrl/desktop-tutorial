package com.bujo.app.data.local

import androidx.room.TypeConverter
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.LogType
import com.bujo.app.data.model.Signifier
import com.bujo.app.data.model.TaskState

/** enum は名前の文字列として保存する（クエリ内で 'TASK' などと直接比較できる） */
class Converters {
    @TypeConverter fun toEntryType(value: String) = EntryType.valueOf(value)
    @TypeConverter fun fromEntryType(value: EntryType) = value.name

    @TypeConverter fun toTaskState(value: String) = TaskState.valueOf(value)
    @TypeConverter fun fromTaskState(value: TaskState) = value.name

    @TypeConverter fun toSignifier(value: String) = Signifier.valueOf(value)
    @TypeConverter fun fromSignifier(value: Signifier) = value.name

    @TypeConverter fun toLogType(value: String) = LogType.valueOf(value)
    @TypeConverter fun fromLogType(value: LogType) = value.name
}
