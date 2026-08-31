package com.bujo.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.bujo.app.data.model.Entry
import com.bujo.app.data.model.EntryType
import com.bujo.app.data.model.Signifier
import com.bujo.app.data.model.TaskState
import com.bujo.app.data.model.bulletGlyph
import com.bujo.app.ui.theme.BulletTextStyle

@Composable
fun BulletMark(entry: Entry, modifier: Modifier = Modifier) {
    val faded = entry.type == EntryType.TASK &&
        entry.state in setOf(TaskState.DONE, TaskState.CANCELLED, TaskState.MIGRATED, TaskState.SCHEDULED)
    val color: Color = when {
        entry.signifier == Signifier.PRIORITY && !faded -> MaterialTheme.colorScheme.primary
        faded -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> MaterialTheme.colorScheme.onSurface
    }
    Box(modifier = modifier.size(28.dp), contentAlignment = Alignment.Center) {
        Text(text = bulletGlyph(entry.type, entry.state), style = BulletTextStyle, color = color)
    }
}

/** サインファイア（* ! ?）をバレットの左に表示する */
@Composable
fun SignifierMark(signifier: Signifier, modifier: Modifier = Modifier) {
    Box(modifier = modifier.size(width = 14.dp, height = 28.dp), contentAlignment = Alignment.Center) {
        if (signifier != Signifier.NONE) {
            Text(
                text = signifier.glyph,
                style = BulletTextStyle,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}
