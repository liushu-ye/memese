package com.example.memecard.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// 品牌粉红。必须与 res/values/colors.xml 里的 ic_launcher_background 保持一致，
// 否则图标和应用内配色会对不上。
private val Brand = Color(0xFFEC407A)

private val LightColors = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFD9E2),
    onPrimaryContainer = Color(0xFF3E001D),
    surface = Color(0xFFFFFBFF),
    background = Color(0xFFFFFBFF),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB1C8),
    onPrimary = Color(0xFF62002F),
    primaryContainer = Color(0xFF8B003F),
    onPrimaryContainer = Color(0xFFFFD9E2),
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
