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

    /** 上次成功同步时服务端返回的 ETag，用于条件请求。 */
    val etag: String?
        get() = prefs.getString(KEY_ETAG, null)

    val lastSyncedAt: Long
        get() = prefs.getLong(KEY_SYNCED_AT, 0L)

    fun saveSync(etag: String?) {
        prefs.edit()
            .putString(KEY_ETAG, etag)
            .putLong(KEY_SYNCED_AT, System.currentTimeMillis())
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "memecard"
        private const val KEY_LANGS = "enabled_langs"
        private const val KEY_ETAG = "etag"
        private const val KEY_SYNCED_AT = "synced_at"

        /** 默认显示中文和英语：母语 + 最通用的外语。 */
        val DEFAULT_LANGS: Set<Lang> = setOf(Lang.ZH, Lang.EN)
    }
}
