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
