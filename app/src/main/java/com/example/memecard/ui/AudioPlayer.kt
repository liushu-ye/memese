package com.example.memecard.ui

import android.content.Context
import android.media.MediaPlayer
import java.io.File

/**
 * 播放打包在 assets 里的单词发音。
 *
 * 为什么先落盘再播，而不是用 assets.openFd()：
 * openFd 只对「未压缩」的 assets 有效，依赖 aapt 的 noCompress 配置；
 * 而这些音频每个只有 8~12 KB，复制到 cacheDir 一次（之后复用）成本可以忽略，
 * 换来的是不依赖任何打包细节。
 */
class AudioPlayer(private val context: Context) {

    private var player: MediaPlayer? = null

    /** @return true 表示开始播放 */
    fun play(assetPath: String): Boolean {
        stop()
        val file = materialize(assetPath) ?: return false
        return try {
            player = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                setOnCompletionListener { stop() }
                setOnErrorListener { _, _, _ -> stop(); true }
                prepare()
                start()
            }
            true
        } catch (_: Exception) {
            stop()
            false
        }
    }

    /** 把 assets 里的音频复制到 cacheDir（同名已存在则直接复用）。 */
    private fun materialize(assetPath: String): File? {
        val out = File(context.cacheDir, assetPath.replace('/', '_'))
        if (out.exists() && out.length() > 0) return out
        return runCatching {
            context.assets.open(assetPath).use { input ->
                out.outputStream().use { input.copyTo(it) }
            }
            out
        }.getOrNull()
    }

    fun stop() {
        runCatching {
            player?.let {
                if (it.isPlaying) it.stop()
                it.release()
            }
        }
        player = null
    }
}
