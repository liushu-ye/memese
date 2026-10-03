package com.example.memecard.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.example.memecard.R

/**
 * 反馈入口。
 *
 * 用 Compose 自带的剪贴板 API，不需要任何权限；
 * Toast 用平台自带的，也不引新依赖。
 */
@Composable
fun FeedbackDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val qqNumber = stringResource(R.string.feedback_qq_number)

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                imageVector = Icons.Default.Email,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
        },
        title = { Text(stringResource(R.string.feedback_title)) },
        text = {
            Column {
                Text(
                    text = stringResource(R.string.feedback_message),
                    style = MaterialTheme.typography.bodyMedium,
                )

                Spacer(Modifier.height(14.dp))

                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = stringResource(R.string.feedback_qq),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    clipboard.setText(AnnotatedString(qqNumber))
                    Toast.makeText(
                        context,
                        context.getString(R.string.feedback_copied),
                        Toast.LENGTH_SHORT,
                    ).show()
                },
            ) {
                Text(stringResource(R.string.feedback_copy))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.feedback_close))
            }
        },
    )
}
