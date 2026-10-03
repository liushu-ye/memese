package com.example.memecard

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.example.memecard.ui.MemeApp
import com.example.memecard.ui.MemeCardTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MemeCardTheme {
                MemeApp()
            }
        }
    }
}
