package com.example.memecard.data

import android.content.Context
import org.json.JSONObject

/**
 * 内置发音音频的索引。
 *
 * 音频由 tools/audio/generate_audio.py 一次性生成并打包进 assets ——
 * 因此 App 端不需要系统 TTS、不需要联网、不需要任何额外权限。
 *
 * 为什么不自己算 hash 定位文件：清单里直接给出「词 → 资源路径」，
 * 少一层约定就少一处可能对不上的地方，而且出问题时能直接打开 index.json 看。
 */
object AudioRepository {

    private const val ASSET_INDEX = "audio/index.json"

    @Volatile
    private var index: Map<String, String>? = null

    /** 立刻返回，失败时返回空表（朗读会回退到系统 TTS）。 */
    fun immediate(context: Context): Map<String, String> {
        index?.let { return it }
        val loaded = runCatching {
            val text = context.assets.open(ASSET_INDEX)
                .bufferedReader(Charsets.UTF_8).use { it.readText() }
            val root = JSONObject(text)
            val map = HashMap<String, String>(root.length())
            for (key in root.keys()) {
                val path = root.optString(key)
                if (path.isNotBlank()) map[key] = path
            }
            map
        }.getOrDefault(emptyMap())
        index = loaded
        return loaded
    }

    /** 清单里该词对应的资源路径；没有就返回 null。 */
    fun assetPathFor(context: Context, lang: Lang, word: String): String? =
        immediate(context)["${lang.name.lowercase()}:$word"]
}
