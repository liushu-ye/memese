package com.example.memecard.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// 品牌紫。取自自定义图标的主色系（图标底 #33128A、亮部 #7624B7），
// 这里取一个在浅色背景上可读、与白字对比度约 6.7:1 的中间调。
private val Brand = Color(0xFF6C3BC9)

private val LightColors = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE9DDFF),
    onPrimaryContainer = Color(0xFF22005D),
    surface = Color(0xFFFFFBFF),
    background = Color(0xFFFFFBFF),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFCFBCFF),
    onPrimary = Color(0xFF381E72),
    primaryContainer = Color(0xFF4F378B),
    onPrimaryContainer = Color(0xFFE9DDFF),
)

/**
 * 刻意不使用 dynamicColorScheme：
 * 动态取色在 API 31+ 才可用，且会让不同设备上观感差异很大。
 * 这个 App 界面极简，固定的品牌色更可控。
 */
@Composable
fun MemeCardTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
