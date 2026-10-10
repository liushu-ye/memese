package com.example.memecard.ui

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.example.memecard.R
import com.example.memecard.data.Lang
import com.example.memecard.data.Meme
import com.example.memecard.data.MemeDeck
import com.example.memecard.data.MemePrefs
import com.example.memecard.data.MemeRepository
import com.example.memecard.data.Tokenizer
import com.example.memecard.data.WordTable

/** 被点中的词及其所属语言。 */
private data class WordTap(val lang: Lang, val word: String)

/**
 * 整个 App 只有这一个状态持有者。
 *
 * 为什么不用 ViewModel / Navigation：
 * 本机 Gradle 缓存里没有 navigation-compose，而界面只有「主页 + 弹窗」，
 * 用几个 boolean 就够，不值得为此引一套导航框架。
 */
@Composable
fun MemeApp() {
    val context = LocalContext.current
    val prefs = remember { MemePrefs(context) }
    val deck = remember { MemeDeck() }
    val speaker = remember { Speaker(context) }

    var memes by remember { mutableStateOf<List<Meme>>(emptyList()) }
    var words by remember { mutableStateOf(WordTable.EMPTY) }
    var current by remember { mutableStateOf<Meme?>(null) }
    var enabledLangs by remember { mutableStateOf(prefs.enabledLangs) }
    var showSettings by remember { mutableStateOf(false) }
    var showFeedback by remember { mutableStateOf(false) }
    var tapped by remember { mutableStateOf<WordTap?>(null) }

    DisposableEffect(Unit) {
        onDispose { speaker.shutdown() }
    }

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
        words = MemeRepository.immediateWords(context)
        pickNext(local)

        // 第二步：后台尝试拉最新；失败就继续用本地的，用户无感
        if (MemeRepository.sync(context)) {
            val updated = MemeRepository.immediate(context)
            memes = updated
            words = MemeRepository.immediateWords(context)
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
        segmentFor = { text, lang -> Tokenizer.segment(text, lang, words) },
        onWordClick = { lang, word -> tapped = WordTap(lang, word) },
        showTapHint = !words.en.isEmpty || !words.ja.isEmpty,
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

    tapped?.let { tap ->
        WordSheet(
            word = tap.word,
            lang = tap.lang,
            entry = words.dictFor(tap.lang)?.get(tap.word),
            onSpeak = {
                val ok = speaker.speak(tap.word, tap.lang.bcp47())
                if (!ok) {
                    Toast.makeText(
                        context,
                        context.getString(R.string.word_tts_missing),
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            },
            onDismiss = { tapped = null },
        )
    }
}
