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

    /**
     * 已标记「学会了」的梗 ID（就是飞书表格里的 ID 列）。
     *
     * 用 ID 而不是下标或 record_id：ID 是用户自己在表格里维护的稳定标识，
     * 数据增删后不会错位；record_id 是飞书内部的，没必要依赖。
     */
    var learnedIds: Set<Int>
        get() = prefs.getStringSet(KEY_LEARNED, null)
            ?.mapNotNull { it.toIntOrNull() }
            ?.toSet()
            ?: emptySet()
        set(value) {
            prefs.edit()
                .putStringSet(KEY_LEARNED, value.map { it.toString() }.toSet())
                .apply()
        }

    fun markLearned(id: Int) {
        learnedIds = learnedIds + id
    }

    fun unmarkLearned(id: Int) {
        learnedIds = learnedIds - id
    }

    fun clearLearned() {
        prefs.edit().remove(KEY_LEARNED).apply()
    }

    companion object {
        private const val PREFS_NAME = "memecard"
        private const val KEY_LANGS = "enabled_langs"
        private const val KEY_LEARNED = "learned_ids"

        /** 默认显示中文和英语：母语 + 最通用的外语。 */
        val DEFAULT_LANGS: Set<Lang> = setOf(Lang.ZH, Lang.EN)
    }
}
