package com.example.memecard.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.example.memecard.data.Lang
import com.example.memecard.data.Meme
import com.example.memecard.data.MemeDeck
import com.example.memecard.data.MemePrefs
import com.example.memecard.data.MemeRepository

/**
 * 整个 App 只有这一个状态持有者。
 *
 * 为什么不用 ViewModel / Navigation：
 * 本机 Gradle 缓存里没有 navigation-compose，而这里只有「主页 + 一个底部弹窗」，
 * 用一个 boolean 控制弹窗就够了，不值得为它引一套导航框架。
 */
@Composable
fun MemeApp() {
    val context = LocalContext.current
    val prefs = remember { MemePrefs(context) }
    val deck = remember { MemeDeck() }

    var memes by remember { mutableStateOf<List<Meme>>(emptyList()) }
    var current by remember { mutableStateOf<Meme?>(null) }
    var enabledLangs by remember { mutableStateOf(prefs.enabledLangs) }
    var showSettings by remember { mutableStateOf(false) }
    var showFeedback by remember { mutableStateOf(false) }

    fun pickNext(list: List<Meme>) {
        if (list.isEmpty()) {
            current = null
            return
        }
        current = list.getOrNull(deck.next(list.size))
    }

    LaunchedEffect(Unit) {
        // 第一步：同步读取本地数据并立刻显示，不阻塞、不白屏
        val local = MemeRepository.immediate(context)
        memes = local
        pickNext(local)

        // 第二步：后台尝试拉最新；失败就继续用本地的，用户无感
        if (MemeRepository.sync(context)) {
            val updated = MemeRepository.immediate(context)
            memes = updated
            deck.reset()
            pickNext(updated)
        }
    }

    HomeScreen(
        meme = current,
        enabledLangs = enabledLangs,
        onRefresh = { pickNext(memes) },
        onOpenSettings = { showSettings = true },
        onOpenFeedback = { showFeedback = true },
    )

    if (showSettings) {
        SettingsSheet(
            enabledLangs = enabledLangs,
            onToggle = { lang ->
                val next: Set<Lang> =
                    if (lang in enabledLangs) enabledLangs - lang else enabledLangs + lang
                enabledLangs = next
                prefs.enabledLangs = next
            },
            onDismiss = { showSettings = false },
        )
    }

    if (showFeedback) {
        FeedbackDialog(onDismiss = { showFeedback = false })
    }
}
