package com.example.memecard.data

/** 词表里的一个词条。 */
data class WordEntry(
    /** 英语是 IPA 音标，日语是假名读音。 */
    val reading: String,
    /** 中文释义。 */
    val zh: String,
)

/** 文本里的一段。word 为 null 表示不可点（标点、空白、或词表里没有）。 */
data class Segment(
    val text: String,
    val word: String?,
)

/** 某一门语言的词表，附带最长词长度用于贪心匹配的剪枝。 */
class WordDict(private val entries: Map<String, WordEntry>) {

    val size: Int get() = entries.size

    /** 最长词的长度；贪心匹配从它开始往回试，不用每次都扫到字符串末尾。 */
    val maxLength: Int = entries.keys.maxOfOrNull { it.length } ?: 0

    val isEmpty: Boolean get() = entries.isEmpty()

    operator fun get(key: String): WordEntry? = entries[key]

    fun isWord(key: String): Boolean = entries.containsKey(key)

    companion object {
        val EMPTY = WordDict(emptyMap())
    }
}

/** 双语的词表。中文是母语，不提供查词。 */
class WordTable(val en: WordDict, val ja: WordDict) {

    /** 该语言没有词表时返回 null —— 调用方据此决定这段文字是否可点。 */
    fun dictFor(lang: Lang): WordDict? = when (lang) {
        Lang.EN -> en.takeIf { !it.isEmpty }
        Lang.JA -> ja.takeIf { !it.isEmpty }
        // 中文是母语，不查
        Lang.ZH -> null
    }

    companion object {
        val EMPTY = WordTable(WordDict.EMPTY, WordDict.EMPTY)
    }
}

/**
 * 把译文切成可点击的片段。
 *
 * 这里**不做任何自然语言处理** —— 词表的边界是离线预生成好的，
 * App 端只按已有词表匹配，所以不需要分词库，也不需要联网。
 *
 * - 英语：按字母序列切，空格标点原样保留为不可点片段
 * - 中日文：贪心最长匹配
 *
 * 两条路径都不依赖 Android API，是可测的纯函数。
 */
object Tokenizer {

    /** 允许词内出现连字符和撇号，这样 laid-back / I'm / can't 会当成一个词。 */
    private val EN_WORD = Regex("[A-Za-z][A-Za-z'\\-]*")

    fun english(text: String, dict: WordDict): List<Segment> {
        val out = ArrayList<Segment>()
        var cursor = 0
        for (m in EN_WORD.findAll(text)) {
            if (m.range.first > cursor) {
                out += Segment(text.substring(cursor, m.range.first), null)
            }
            val surface = m.value
            val key = surface.lowercase()
            out += Segment(surface, key.takeIf { dict.isWord(it) })
            cursor = m.range.last + 1
        }
        if (cursor < text.length) out += Segment(text.substring(cursor), null)
        return out
    }

    fun cjk(text: String, dict: WordDict): List<Segment> {
        if (text.isEmpty()) return emptyList()
        val out = ArrayList<Segment>()
        var i = 0
        while (i < text.length) {
            var hit: String? = null
            var len = minOf(dict.maxLength, text.length - i)
            while (len >= 1) {
                val cand = text.substring(i, i + len)
                if (dict.isWord(cand)) { hit = cand; break }
                len--
            }
            if (hit != null) {
                out += Segment(hit, hit)
                i += hit.length
            } else {
                // 未命中：并入上一段不可点内容，避免碎成一堆单字符片段
                val last = out.lastOrNull()
                if (last != null && last.word == null) {
                    out[out.size - 1] = last.copy(text = last.text + text[i])
                } else {
                    out += Segment(text[i].toString(), null)
                }
                i++
            }
        }
        return out
    }

    /** 按语言选分词方式。中文没有词表，整段不可点。 */
    fun segment(text: String, lang: Lang, table: WordTable): List<Segment> {
        val dict = table.dictFor(lang) ?: return listOf(Segment(text, null))
        return when (lang) {
            Lang.EN -> english(text, dict)
            Lang.JA -> cjk(text, dict)
            Lang.ZH -> listOf(Segment(text, null))
        }
    }
}
