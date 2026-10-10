package com.example.memecard.data

import android.content.Context

/**
 * 设置与同步元数据的持久化。
 *
 * 用平台自带的 SharedPreferences，不引 DataStore —— 本机 Gradle 缓存里没有那个依赖。
 */
class MemePrefs(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** 当前勾选的语言。存的是 enum 名字，改枚举顺序也不会串。 */
    var enabledLangs: Set<Lang>
        get() {
            val saved = prefs.getStringSet(KEY_LANGS, null) ?: return DEFAULT_LANGS
            return saved.mapNotNull { name -> Lang.entries.firstOrNull { it.name == name } }
                .toSet()
        }
        set(value) {
            prefs.edit()
                .putStringSet(KEY_LANGS, value.map { it.name }.toSet())
                .apply()
        }

    /**
     * 每个数据文件各自记一个 ETag，用于条件请求（没变化时服务端返回 304）。
     * 现在有两个文件：memes.json 和 words.json。
     */
    fun etag(file: String): String? = prefs.getString("etag_$file", null)

    fun lastSyncedAt(file: String): Long = prefs.getLong("synced_$file", 0L)

    fun saveSync(file: String, etag: String?) {
        prefs.edit()
            .putString("etag_$file", etag)
            .putLong("synced_$file", System.currentTimeMillis())
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "memecard"
        private const val KEY_LANGS = "enabled_langs"

        /** 默认显示中文和英语：母语 + 最通用的外语。 */
        val DEFAULT_LANGS: Set<Lang> = setOf(Lang.ZH, Lang.EN)
    }
}
