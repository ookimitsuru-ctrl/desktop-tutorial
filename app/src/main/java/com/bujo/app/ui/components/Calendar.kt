package com.bujo.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bujo.app.data.local.DayCount
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth

/**
 * 月のカレンダー。マンスリーログの日付欄と、日付選択ダイアログの両方で使う。
 * 未完了タスクが残っている日にはドットが付く。
 */
@Composable
fun MonthCalendar(
    month: YearMonth,
    onSelect: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
    selected: LocalDate? = null,
    today: LocalDate = LocalDate.now(),
    counts: Map<String, DayCount> = emptyMap()
) {
    val first = month.atDay(1)
    // 週の始まりは月曜
    val leading = (first.dayOfWeek.value - DayOfWeek.MONDAY.value + 7) % 7
    val cells: List<LocalDate?> = buildList {
        repeat(leading) { add(null) }
        (1..month.lengthOfMonth()).forEach { add(month.atDay(it)) }
        while (size % 7 != 0) add(null)
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth()) {
            weekHeaders.forEachIndexed { index, label ->
                Text(
                    text = label,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall,
                    color = when (index) {
                        5 -> MaterialTheme.colorScheme.primary
                        6 -> MaterialTheme.colorScheme.error
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
        cells.chunked(7).forEach { week ->
            Row(modifier = Modifier.fillMaxWidth()) {
                week.forEach { day ->
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .padding(2.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        if (day != null) DayCell(
                            day = day,
                            isSelected = day == selected,
                            isToday = day == today,
                            count = counts[day.toString()],
                            onClick = { onSelect(day) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DayCell(
    day: LocalDate,
    isSelected: Boolean,
    isToday: Boolean,
    count: DayCount?,
    onClick: () -> Unit
) {
    val bg = when {
        isSelected -> MaterialTheme.colorScheme.primary
        isToday -> MaterialTheme.colorScheme.primaryContainer
        else -> MaterialTheme.colorScheme.surface
    }
    val fg = when {
        isSelected -> MaterialTheme.colorScheme.onPrimary
        isToday -> MaterialTheme.colorScheme.onPrimaryContainer
        else -> MaterialTheme.colorScheme.onSurface
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .then(
                if (!isSelected && (count?.total ?: 0) > 0) {
                    Modifier.border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp))
                } else Modifier
            )
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = day.dayOfMonth.toString(),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (isToday || isSelected) FontWeight.Bold else FontWeight.Normal,
            color = fg
        )
        Box(
            modifier = Modifier
                .padding(top = 2.dp)
                .size(5.dp)
                .clip(CircleShape)
                .background(
                    when {
                        (count?.openTasks ?: 0) > 0 && !isSelected -> MaterialTheme.colorScheme.primary
                        (count?.openTasks ?: 0) > 0 -> MaterialTheme.colorScheme.onPrimary
                        else -> androidx.compose.ui.graphics.Color.Transparent
                    }
                )
        )
    }
}
