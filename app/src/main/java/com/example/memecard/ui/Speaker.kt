package com.example.memecard.ui

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * 系统 TTS 的薄封装。
 *
 * 「怎么读」这件事直接交给平台 —— 零依赖、零成本、离线可用（取决于设备语音包），
 * 不需要查词表也不需要联网。词表里的音标用来看，TTS 用来听，互补。
 */
class Speaker(context: Context) {

    private var engine: TextToSpeech? = null
    private var ready = false

    init {
        engine = TextToSpeech(context.applicationContext) { status ->
            ready = status == TextToSpeech.SUCCESS
        }
    }

    /**
     * @return true 表示确实发起了朗读；false 表示引擎没就绪或设备缺该语言语音包
     */
    fun speak(text: String, bcp47: String): Boolean {
        val e = engine ?: return false
        if (!ready) return false

        val locale = Locale.forLanguageTag(bcp47)
        if (e.isLanguageAvailable(locale) < TextToSpeech.LANG_AVAILABLE) return false

        e.language = locale
        e.speak(text, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
        return true
    }

    fun shutdown() {
        engine?.stop()
        engine?.shutdown()
        engine = null
        ready = false
    }

    private companion object {
        const val UTTERANCE_ID = "memecard-word"
    }
}
