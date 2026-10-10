package com.example.memecard.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 梗数据与词表的唯一入口。
 *
 * 两个文件（memes.json / words.json）走同一套三级数据源：
 *   ① 内存     —— 进程内缓存
 *   ② 本地文件 —— 上次从 CDN 成功同步下来的结果（离线可用）
 *   ③ assets   —— 打包进 APK 的兜底数据（首次安装 / 从未联网）
 *
 * 设计原则：**网络只负责让数据变新，不负责让 App 能用**。
 * 所以 immediate*() 是同步的、永不失败；sync() 是后台的、失败静默。
 */
object MemeRepository {

    /**
     * 数据源。由 GitHub Actions 定时把飞书表格同步回仓库，
     * App 从这里读纯静态 JSON —— 不需要任何 token。
     *
     * 仓库：https://github.com/liushu-ye/memese
     */
    private const val BASE_URL =
        "https://cdn.jsdelivr.net/gh/liushu-ye/memese@main/data"

    private const val FILE_MEMES = "memes.json"
    private const val FILE_WORDS = "words.json"

    /** 占位符原样保留时视为「未配置」，不发任何网络请求。 */
    private const val PLACEHOLDER = "OWNER/REPO"

    @Volatile private var memesMemory: List<Meme>? = null
    @Volatile private var wordsMemory: WordTable? = null

    val syncConfigured: Boolean get() = !BASE_URL.contains(PLACEHOLDER)

    // ────────────────────────── 解析 ──────────────────────────

    /** 解析梗数据。字段缺失时用空串兜底，不会抛异常。 */
    fun parseMemes(text: String): List<Meme> {
        val array = JSONArray(text)
        val out = ArrayList<Meme>(array.length())
        for (i in 0 until array.length()) {
            val o = array.getJSONObject(i)
            out += Meme(
                id = o.optString("ID").toIntOrNull() ?: (i + 1),
                term = o.optString("梗"),
                zh = o.optString("中文"),
                en = o.optString("英语"),
                ja = o.optString("日语"),
            )
        }
        return out.filter { it.term.isNotBlank() }.sortedBy { it.id }
    }

    /** 解析词表。结构见 tools/words/README.md。 */
    fun parseWords(text: String): WordTable {
        val root = JSONObject(text)
        return WordTable(
            en = readDict(root.optJSONObject("en")),
            ja = readDict(root.optJSONObject("ja")),
        )
    }

    private fun readDict(obj: JSONObject?): WordDict {
        if (obj == null) return WordDict.EMPTY
        val map = HashMap<String, WordEntry>(obj.length())
        for (key in obj.keys()) {
            val e = obj.optJSONObject(key) ?: continue
            val reading = e.optString("reading")
            val zh = e.optString("zh")
            if (reading.isBlank() && zh.isBlank()) continue
            map[key] = WordEntry(reading = reading, zh = zh)
        }
        return WordDict(map)
    }

    // ────────────────────────── 本地读取 ──────────────────────────

    private fun cacheFile(context: Context, name: String) = File(context.filesDir, name)

    private fun readAsset(context: Context, name: String): String =
        context.assets.open(name).bufferedReader(Charsets.UTF_8).use { it.readText() }

    private fun readCache(context: Context, name: String): String? {
        val file = cacheFile(context, name)
        return if (file.exists()) runCatching { file.readText(Charsets.UTF_8) }.getOrNull() else null
    }

    /** 按 内存 → 本地缓存 → assets 的顺序取文本，永不失败。 */
    private inline fun <T> load(
        context: Context,
        name: String,
        parse: (String) -> T,
        fallback: () -> T,
    ): T {
        val raw = readCache(context, name) ?: runCatching { readAsset(context, name) }.getOrNull()
        if (raw == null) return fallback()
        return runCatching { parse(raw) }.getOrDefault(fallback())
    }

    /** 立刻返回梗数据，绝不阻塞在网络上。 */
    fun immediate(context: Context): List<Meme> {
        memesMemory?.let { return it }
        val list = load(context, FILE_MEMES, ::parseMemes) { emptyList() }
        memesMemory = list
        return list
    }

    /** 立刻返回词表。取不到时返回空表，查词功能静默降级。 */
    fun immediateWords(context: Context): WordTable {
        wordsMemory?.let { return it }
        val table = load(context, FILE_WORDS, ::parseWords) { WordTable.EMPTY }
        wordsMemory = table
        return table
    }

    // ────────────────────────── 增量同步 ──────────────────────────

    private class Fetch(val notModified: Boolean, val body: String?, val etag: String?)

    /** 带 ETag 的条件请求。任何异常都返回 notModified=true（等同于"保持现状"）。 */
    private fun fetch(url: String, etag: String?): Fetch {
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 5_000
                readTimeout = 8_000
                setRequestProperty("Accept", "application/json")
                etag?.let { setRequestProperty("If-None-Match", it) }
            }
            try {
                when (conn.responseCode) {
                    304 -> Fetch(true, null, null)
                    200 -> Fetch(
                        notModified = false,
                        body = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() },
                        etag = conn.getHeaderField("ETag"),
                    )
                    else -> Fetch(true, null, null)
                }
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            Fetch(true, null, null)
        }
    }

    /** 先写临时文件再改名，避免写到一半被杀导致缓存损坏。 */
    private fun writeCache(context: Context, name: String, text: String) {
        val target = cacheFile(context, name)
        val tmp = File(context.filesDir, "$name.tmp")
        tmp.writeText(text, Charsets.UTF_8)
        if (!tmp.renameTo(target)) {
            target.writeText(text, Charsets.UTF_8)
            tmp.delete()
        }
    }

    /**
     * 后台增量同步两个文件。
     *
     * @return true 表示任一文件确实更新了，调用方应刷新界面
     */
    suspend fun sync(context: Context): Boolean = withContext(Dispatchers.IO) {
        if (!syncConfigured) return@withContext false
        val prefs = MemePrefs(context)
        var changed = false

        // ---- 梗数据 ----
        val memesFetch = fetch("$BASE_URL/$FILE_MEMES", prefs.etag(FILE_MEMES))
        if (!memesFetch.notModified && memesFetch.body != null) {
            val parsed = runCatching { parseMemes(memesFetch.body) }.getOrDefault(emptyList())
            if (parsed.isNotEmpty()) {
                writeCache(context, FILE_MEMES, memesFetch.body)
                prefs.saveSync(FILE_MEMES, memesFetch.etag)
                memesMemory = parsed
                changed = true
            }
        }

        // ---- 词表 ----
        val wordsFetch = fetch("$BASE_URL/$FILE_WORDS", prefs.etag(FILE_WORDS))
        if (!wordsFetch.notModified && wordsFetch.body != null) {
            val parsed = runCatching { parseWords(wordsFetch.body) }.getOrDefault(WordTable.EMPTY)
            if (parsed.en.size > 0 || parsed.ja.size > 0) {
                writeCache(context, FILE_WORDS, wordsFetch.body)
                prefs.saveSync(FILE_WORDS, wordsFetch.etag)
                wordsMemory = parsed
                changed = true
            }
        }

        changed
    }
}
