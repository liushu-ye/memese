package com.example.memecard.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Brand = Color(0xFF1B6FB5)

private val LightColors = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD3E4FF),
    onPrimaryContainer = Color(0xFF001C38),
    surface = Color(0xFFFDFBFF),
    background = Color(0xFFFDFBFF),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA2C9FF),
    onPrimary = Color(0xFF00325A),
    primaryContainer = Color(0xFF00497F),
    onPrimaryContainer = Color(0xFFD3E4FF),
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
