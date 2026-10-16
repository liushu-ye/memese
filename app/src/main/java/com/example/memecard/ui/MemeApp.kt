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
import com.example.memecard.data.AudioRepository
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
    val audio = remember { AudioPlayer(context) }

    var memes by remember { mutableStateOf<List<Meme>>(emptyList()) }
    var words by remember { mutableStateOf(WordTable.EMPTY) }
    var current by remember { mutableStateOf<Meme?>(null) }
    var enabledLangs by remember { mutableStateOf(prefs.enabledLangs) }
    var learned by remember { mutableStateOf(prefs.learnedIds) }
    var reviewMode by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var showFeedback by remember { mutableStateOf(false) }
    var tapped by remember { mutableStateOf<WordTap?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            audio.stop()
            speaker.shutdown()
        }
    }

    /**
     * 抽题池。
     *
     * 正常模式只从「没学过」里抽 —— 这就是用户要的「已学的不再随机到」。
     * 复习模式反过来只抽已学的，这样误标了也能找回来取消，不至于只能清空重来。
     */
    val pool = remember(memes, learned, reviewMode) {
        if (reviewMode) memes.filter { it.id in learned }
        else memes.filter { it.id !in learned }
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
        memes = MemeRepository.immediate(context)
        words = MemeRepository.immediateWords(context)

        // 第二步：后台尝试拉最新；失败就继续用本地的，用户无感
        if (MemeRepository.sync(context)) {
            memes = MemeRepository.immediate(context)
            words = MemeRepository.immediateWords(context)
        }
    }

    // 池子一变（标记已学 / 切换复习模式 / 数据首次载入）就重洗并抽下一张。
    // 用 pool 作为 key，等于「内容变了才重来」，不会每次重组都跳牌。
    LaunchedEffect(pool) {
        deck.reset()
        pickNext(pool)
    }

    /** 当前这张是不是已学 —— 决定按钮是「学会了」还是「取消已学」。 */
    val currentLearned = current?.let { it.id in learned } == true

    HomeScreen(
        meme = current,
        enabledLangs = enabledLangs,
        isLearned = currentLearned,
        learnedCount = learned.size,
        totalCount = memes.size,
        allLearned = !reviewMode && memes.isNotEmpty() && pool.isEmpty(),
        reviewMode = reviewMode,
        onRefresh = { pickNext(pool) },
        onToggleLearned = {
            val m = current
            if (m != null) {
                val next = if (m.id in learned) learned - m.id else learned + m.id
                learned = next
                prefs.learnedIds = next
            }
        },
        onRestart = {
            learned = emptySet()
            prefs.clearLearned()
        },
        onOpenSettings = { showSettings = true },
        onOpenFeedback = { showFeedback = true },
        segmentFor = { text, lang -> Tokenizer.segment(text, lang, words) },
        onWordClick = { lang, word -> tapped = WordTap(lang, word) },
        showTapHint = !words.en.isEmpty || !words.ja.isEmpty,
    )

    if (showSettings) {
        SettingsSheet(
            enabledLangs = enabledLangs,
            learnedCount = learned.size,
            totalCount = memes.size,
            reviewMode = reviewMode,
            onToggle = { lang ->
                val next: Set<Lang> =
                    if (lang in enabledLangs) enabledLangs - lang else enabledLangs + lang
                enabledLangs = next
                prefs.enabledLangs = next
            },
            onToggleReviewMode = { reviewMode = !reviewMode },
            onClearLearned = {
                learned = emptySet()
                prefs.clearLearned()
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
                // 优先用打包好的音频：离线、音质好、不依赖手机的 TTS 引擎。
                // 只有词表里新增、还没生成音频的词才会回退到系统 TTS。
                val bundled = AudioRepository.assetPathFor(context, tap.lang, tap.word)
                val played = bundled != null && audio.play(bundled)

                if (!played && !speaker.speak(tap.word, tap.lang.bcp47())) {
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
