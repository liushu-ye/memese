package com.example.memecard.ui

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import com.example.memecard.data.Segment

/**
 * 把分词结果渲染成可点击的文本。
 *
 * 为什么手写点击命中而不用 LinkAnnotation：
 * 本机只能离线构建，我不想为一个「点词」引入任何新 API 风险；
 * 用 onTextLayout + getOffsetForPosition 是零 API 依赖的做法，
 * 且完整保留原文的排版与换行。
 */
@Composable
fun ClickableTranslation(
    segments: List<Segment>,
    style: TextStyle,
    modifier: Modifier = Modifier,
    linkColor: Color = MaterialTheme.colorScheme.primary,
    onWordClick: (String) -> Unit,
) {
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }

    val annotated = remember(segments, linkColor) {
        buildAnnotatedString {
            segments.forEach { seg ->
                if (seg.word == null) {
                    append(seg.text)
                } else {
                    withStyle(SpanStyle(color = linkColor)) { append(seg.text) }
                }
            }
        }
    }

    // 每段在 AnnotatedString 里的字符区间，用于把点击位置映射回词
    val ranges = remember(segments) {
        var index = 0
        segments.map { seg ->
            val start = index
            index += seg.text.length
            WordRange(start, index, seg.word)
        }
    }

    Text(
        text = annotated,
        style = style,
        textAlign = TextAlign.Center,
        onTextLayout = { layout = it },
        modifier = modifier.pointerInput(ranges) {
            detectTapGestures { position ->
                val result = layout ?: return@detectTapGestures
                val offset = result.getOffsetForPosition(position)
                ranges
                    .firstOrNull { it.word != null && offset >= it.start && offset < it.end }
                    ?.word
                    ?.let(onWordClick)
            }
        },
    )
}

private data class WordRange(val start: Int, val end: Int, val word: String?)

/** 没有词表时的退化渲染：整段纯文本，不可点。 */
@Composable
fun PlainTranslation(text: String, style: TextStyle, modifier: Modifier = Modifier) {
    Text(text = text, style = style, textAlign = TextAlign.Center, modifier = modifier)
}
