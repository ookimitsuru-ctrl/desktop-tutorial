package com.example.planetgrow

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.planetgrow.core.GameTime
import com.example.planetgrow.core.Scene
import com.example.planetgrow.core.Sky
import com.example.planetgrow.core.Tex
import com.example.planetgrow.core.World
import com.example.planetgrow.core.tiledSwatch

/**
 * オープニングタイトル。育てている惑星のスナップショットを背景に、
 * タイトルの文字は惑星と同じブロックのテクスチャで塗って作る (1文字ごとに違うブロック)。
 */
@Composable
fun TitleScreen(onEnter: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current

    BoxWithConstraints(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF05070F))
    ) {
        val widthPx = constraints.maxWidth.coerceAtLeast(1)
        val heightPx = constraints.maxHeight.coerceAtLeast(1)

        val backdrop = remember(widthPx, heightPx) {
            val prefs = PlanetPrefs(context)
            val now = GameTime.now()
            val state = prefs.load(now)
            val world = World(state)
            world.syncFromState(now)
            val viewBlocks = Scene.viewBlocksFor(state, now)
            val blockPx = Scene.blockPxFor(viewBlocks)
            val size = Scene.bufferSize(widthPx, heightPx, viewBlocks, blockPx)
            val scene = Scene(size[0], size[1], blockPx)
            val sky = Sky(0.5f, now)
            scene.render(world, sky, 0f, 0f)
            val bmp = Bitmap.createBitmap(scene.width, scene.height, Bitmap.Config.ARGB_8888)
            bmp.setPixels(scene.frame.px, 0, scene.width, 0, 0, scene.width, scene.height)
            bmp.asImageBitmap()
        }

        Image(
            bitmap = backdrop,
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
            filterQuality = FilterQuality.None
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x8A05070F))
        )

        // タイトルの文字は、惑星を作っているのと同じブロックのテクスチャで塗る (1文字ずつ違う種類)
        val letterBrushes = remember {
            listOf(Tex.grassTop, Tex.dirt, Tex.stone, Tex.log, Tex.plank).map { variants ->
                val sw = tiledSwatch(variants, 4)
                val bmp = Bitmap.createBitmap(sw.w, sw.h, Bitmap.Config.ARGB_8888)
                bmp.setPixels(sw.px, 0, sw.w, 0, 0, sw.w, sw.h)
                ShaderBrush(ImageShader(bmp.asImageBitmap(), TileMode.Repeated, TileMode.Repeated))
            }
        }
        val titleChars = listOf('ほ', 'し', 'そ', 'だ', 'て')

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0x55000000))
                .padding(horizontal = 28.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (i in titleChars.indices) {
                    Text(
                        text = titleChars[i].toString(),
                        style = TextStyle(
                            brush = letterBrushes[i % letterBrushes.size],
                            fontSize = 52.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            shadow = Shadow(Color(0xCC000000), Offset(3f, 5f), 6f)
                        )
                    )
                }
            }
            Text(
                text = "PLANET GROW",
                color = Color(0xFFBFD4F0),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace
            )
        }

        Text(
            text = "ほしにもどる",
            color = Color(0xFF0B1020),
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 40.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xFFE9D9A8))
                .clickable { onEnter() }
                .padding(horizontal = 36.dp, vertical = 14.dp)
        )
    }
}
