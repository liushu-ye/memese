package com.example.memecard.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 梗数据的唯一入口。
 *
 * 三级数据源，从快到慢：
 *   ① 内存     —— 进程内缓存
 *   ② 本地文件 —— 上次从 CDN 成功同步下来的结果（离线可用）
 *   ③ assets   —— 打包进 APK 的兜底数据（首次安装 / 从未联网）
 *
 * 设计原则：**网络只负责让数据变新，不负责让 App 能用**。
 * 所以 immediate() 是同步的、永不失败；sync() 是后台的、失败静默。
 */
object MemeRepository {

    /**
     * 数据源。由 GitHub Actions 定时把飞书表格同步回仓库，
     * App 从这里读一个纯静态 JSON —— 不需要任何 token。
     *
     * 把 OWNER/REPO 换成你自己的仓库即可启用同步；
     * 保持原样则 App 只用 assets 内置数据，不发起任何网络请求。
     */
    private const val ENDPOINT =
        "https://cdn.jsdelivr.net/gh/OWNER/REPO@main/data/memes.json"

    private const val ASSET_NAME = "memes.json"
    private const val CACHE_NAME = "memes.json"

    @Volatile
    private var memory: List<Meme>? = null

    /** 是否已经配置了同步地址。 */
    val syncConfigured: Boolean
        get() = !ENDPOINT.contains("OWNER/REPO")

    /** 解析导出的 JSON 数组。字段缺失时用空串兜底，不会抛异常。 */
    fun parse(text: String): List<Meme> {
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

    private fun cacheFile(context: Context) = File(context.filesDir, CACHE_NAME)

    private fun readAsset(context: Context): List<Meme> =
        context.assets.open(ASSET_NAME)
            .bufferedReader(Charsets.UTF_8)
            .use { parse(it.readText()) }

    private fun readCache(context: Context): List<Meme>? {
        val file = cacheFile(context)
        if (!file.exists()) return null
        return runCatching { parse(file.readText(Charsets.UTF_8)) }
            .getOrNull()
            ?.takeIf { it.isNotEmpty() }
    }

    /**
     * 立刻返回数据，绝不阻塞在网络上。
     * 冷启动首帧就有内容，不会出现白屏或转圈。
     */
    fun immediate(context: Context): List<Meme> {
        memory?.let { return it }
        val list = readCache(context) ?: readAsset(context)
        memory = list
        return list
    }

    /**
     * 后台增量同步。带 ETag 条件请求，没变化时服务端返回 304，不重传 body。
     *
     * @return true 表示数据确实更新了，调用方应刷新界面
     */
    suspend fun sync(context: Context): Boolean = withContext(Dispatchers.IO) {
        if (!syncConfigured) return@withContext false

        val prefs = MemePrefs(context)
        try {
            val conn = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 5_000
                readTimeout = 8_000
                setRequestProperty("Accept", "application/json")
                prefs.etag?.let { setRequestProperty("If-None-Match", it) }
            }

            try {
                when (conn.responseCode) {
                    304 -> false                     // 没变化

                    200 -> {
                        val text = conn.inputStream
                            .bufferedReader(Charsets.UTF_8)
                            .use { it.readText() }

                        // 先解析、解析成功再落盘：避免把坏数据写进缓存
                        val parsed = parse(text)
                        if (parsed.isEmpty()) return@withContext false

                        // 先写临时文件再改名，防止写到一半被杀导致文件损坏
                        val tmp = File(context.filesDir, "$CACHE_NAME.tmp")
                        tmp.writeText(text, Charsets.UTF_8)
                        if (!tmp.renameTo(cacheFile(context))) {
                            cacheFile(context).writeText(text, Charsets.UTF_8)
                            tmp.delete()
                        }

                        prefs.saveSync(conn.getHeaderField("ETag"))
                        memory = parsed
                        true
                    }

                    else -> false                    // 401 / 404 / 5xx 一律降级
                }
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            // 断网、超时、CDN 挂了 —— 都不该打扰用户，继续用本地数据
            false
        }
    }
}
