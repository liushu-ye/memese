package com.example.memecard.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.example.memecard.R
import com.example.memecard.data.Lang

/**
 * 语言在界面上显示的名字。
 * 放在 UI 层而不是 data 层，是为了让 data 包不依赖 Android 资源。
 */
@Composable
fun Lang.displayName(): String = stringResource(
    when (this) {
        Lang.ZH -> R.string.lang_zh
        Lang.EN -> R.string.lang_en
        Lang.JA -> R.string.lang_ja
    }
)

/** 读音那一行的标签：英语显示「音标」，其余显示「读音」。 */
@Composable
fun Lang.readingLabel(): String = stringResource(
    when (this) {
        Lang.EN -> R.string.word_reading_ipa
        else -> R.string.word_reading_kana
    }
)

/** 交给系统 TTS 的 BCP-47 语言标签。 */
fun Lang.bcp47(): String = when (this) {
    Lang.ZH -> "zh-CN"
    Lang.EN -> "en-US"
    Lang.JA -> "ja-JP"
}
