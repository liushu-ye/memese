package com.example.memecard.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.memecard.R
import com.example.memecard.data.Lang
import com.example.memecard.data.Meme
import com.example.memecard.data.Segment
import com.example.memecard.data.textFor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    meme: Meme?,
    enabledLangs: Set<Lang>,
    isLearned: Boolean,
    learnedCount: Int,
    totalCount: Int,
    allLearned: Boolean,
    reviewMode: Boolean,
    onRefresh: () -> Unit,
    onToggleLearned: () -> Unit,
    onRestart: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenFeedback: () -> Unit,
    segmentFor: (String, Lang) -> List<Segment>,
    onWordClick: (Lang, String) -> Unit,
    showTapHint: Boolean,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    IconButton(onClick = onOpenFeedback) {
                        Icon(
                            imageVector = Icons.Default.Email,
                            contentDescription = stringResource(R.string.action_feedback),
                        )
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = stringResource(R.string.action_settings),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 20.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            when {
                allLearned -> AllLearnedState(learnedCount, onRestart)

                meme == null -> EmptyState()

                else -> {
                    MemeCard(
                        meme = meme,
                        enabledLangs = enabledLangs,
                        segmentFor = segmentFor,
                        onWordClick = onWordClick,
                    )

                    if (showTapHint) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            text = stringResource(R.string.word_tap_hint),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Spacer(Modifier.height(20.dp))

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(
                            onClick = onToggleLearned,
                            modifier = Modifier.height(52.dp),
                        ) {
                            Icon(Icons.Default.Check, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text(
                                text = stringResource(
                                    if (isLearned) R.string.action_unlearn else R.string.action_learned,
                                ),
                            )
                        }
                        Button(onClick = onRefresh, modifier = Modifier.height(52.dp)) {
                            Icon(Icons.Default.Refresh, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text(stringResource(R.string.action_refresh))
                        }
                    }

                    Spacer(Modifier.height(14.dp))

                    Text(
                        text = if (reviewMode) {
                            stringResource(R.string.progress_review_format, learnedCount)
                        } else {
                            stringResource(R.string.progress_format, learnedCount, totalCount)
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun MemeCard(
    meme: Meme,
    enabledLangs: Set<Lang>,
    segmentFor: (String, Lang) -> List<Segment>,
    onWordClick: (Lang, String) -> Unit,
) {
    // Lang.entries 保证顺序固定为 中 → 英 → 日，不受 Set 迭代顺序影响
    val ordered = Lang.entries.filter { it in enabledLangs }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 520.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 28.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = meme.term,
                style = MaterialTheme.typography.displaySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.primary,
            )

            if (ordered.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                Spacer(Modifier.height(20.dp))

                ordered.forEachIndexed { index, lang ->
                    if (index > 0) Spacer(Modifier.height(14.dp))

                    val text = meme.textFor(lang)
                    val segments = segmentFor(text, lang)

                    // 有可点片段就用可点击版本，否则退回纯文本（不留假的可点暗示）
                    if (segments.any { it.word != null }) {
                        ClickableTranslation(
                            segments = segments,
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.fillMaxWidth(),
                            onWordClick = { onWordClick(lang, it) },
                        )
                    } else {
                        PlainTranslation(
                            text = text,
                            style = MaterialTheme.typography.titleMedium,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AllLearnedState(count: Int, onRestart: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = stringResource(R.string.all_learned_title),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = stringResource(R.string.all_learned_hint, count),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Button(onClick = onRestart, modifier = Modifier.height(48.dp)) {
            Text(stringResource(R.string.action_restart))
        }
    }
}

@Composable
private fun EmptyState() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = stringResource(R.string.empty_data),
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.empty_data_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
