package com.example.musy

import android.os.Build
import android.webkit.JavascriptInterface
import com.google.gson.Gson

class WebAppInterface(private val activity: MainActivity) {

    private val scanner = MediaStoreScanner(activity)

    @JavascriptInterface
    fun scanSongs(): String {
        return scanner.scanAudioFilesJson()
    }

    @JavascriptInterface
    fun selectFolder() {
        activity.runOnUiThread {
            activity.openFolderPicker()
        }
    }

    @JavascriptInterface
    fun playSong(path: String, title: String, artist: String, id: String, cover: String) {
        activity.runOnUiThread {
            activity.playTrack(path, title, artist, id, cover)
        }
    }

    @JavascriptInterface
    fun pauseSong() {
        activity.runOnUiThread {
            activity.pauseTrack()
        }
    }

    @JavascriptInterface
    fun resumeSong() {
        activity.runOnUiThread {
            activity.resumeTrack()
        }
    }

    @JavascriptInterface
    fun seekTo(positionMs: Long) {
        activity.runOnUiThread {
            activity.seekTrack(positionMs)
        }
    }

    @JavascriptInterface
    fun setVolume(volume: Float) {
        activity.runOnUiThread {
            activity.setVolume(volume)
        }
    }

    @JavascriptInterface
    fun getWallpaperColors(): String {
        val map = mutableMapOf<String, String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val primary = activity.getColor(android.R.color.system_accent1_300)
                val primaryContainer = activity.getColor(android.R.color.system_accent1_100)
                val background = activity.getColor(android.R.color.system_neutral1_900)
                val surface = activity.getColor(android.R.color.system_neutral1_800)
                val onSurface = activity.getColor(android.R.color.system_neutral1_100)
                val outline = activity.getColor(android.R.color.system_neutral2_300)

                map["primary"] = String.format("#%06X", 0xFFFFFF and primary)
                map["primaryContainer"] = String.format("#%06X", 0xFFFFFF and primaryContainer)
                map["background"] = String.format("#%06X", 0xFFFFFF and background)
                map["surface"] = String.format("#%06X", 0xFFFFFF and surface)
                map["onSurface"] = String.format("#%06X", 0xFFFFFF and onSurface)
                map["outline"] = String.format("#%06X", 0xFFFFFF and outline)
            } catch (e: Exception) {
                // Fallback
            }
        }
        return Gson().toJson(map)
    }
}
