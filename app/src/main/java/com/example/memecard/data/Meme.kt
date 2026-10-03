package com.example.memecard.data

/**
 * 一个梗及其三种语言版本。
 * 字段名与飞书多维表格的表头一一对应，改表头时同步改这里即可。
 */
data class Meme(
    val id: Int,
    val term: String,   // 梗，例如 YYDS
    val zh: String,     // 中文
    val en: String,     // 英语
    val ja: String,     // 日语
)

/**
 * 可显示的语言。
 * jsonKey 必须与导出的 memes.json 里的字段名完全一致。
 */
enum class Lang(val jsonKey: String) {
    ZH("中文"),
    EN("英语"),
    JA("日语"),
}

fun Meme.textFor(lang: Lang): String = when (lang) {
    Lang.ZH -> zh
    Lang.EN -> en
    Lang.JA -> ja
}
