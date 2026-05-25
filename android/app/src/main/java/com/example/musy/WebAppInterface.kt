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

    @JavascriptInterface
    fun loadLyrics(path: String): String {
        try {
            if (path.startsWith("/")) {
                val file = java.io.File(path)
                val baseName = file.nameWithoutExtension
                val parentDir = file.parentFile
                if (parentDir != null && parentDir.exists()) {
                    val lrcFile = java.io.File(parentDir, "$baseName.lrc")
                    if (lrcFile.exists()) {
                        return lrcFile.readText()
                    }
                }
            } else if (path.startsWith("content://")) {
                val trackUri = android.net.Uri.parse(path)
                val context = activity
                var displayName = ""
                context.contentResolver.query(trackUri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        displayName = cursor.getString(0) ?: ""
                    }
                }
                if (displayName.isNotEmpty()) {
                    val baseName = displayName.substringBeforeLast(".")
                    val sharedPref = context.getSharedPreferences("musy_prefs", android.content.Context.MODE_PRIVATE)
                    val folderUriStr = sharedPref.getString("selected_folder_uri", null)
                    if (folderUriStr != null) {
                        val treeUri = android.net.Uri.parse(folderUriStr)
                        val treeDir = androidx.documentfile.provider.DocumentFile.fromTreeUri(context, treeUri)
                        if (treeDir != null) {
                            val lrcDoc = findLrcFileInTree(treeDir, baseName)
                            if (lrcDoc != null) {
                                context.contentResolver.openInputStream(lrcDoc.uri)?.use { stream ->
                                    return stream.bufferedReader().use { it.readText() }
                                }
                            }
                        }
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return ""
    }

    private fun findLrcFileInTree(dir: androidx.documentfile.provider.DocumentFile, baseName: String): androidx.documentfile.provider.DocumentFile? {
        for (file in dir.listFiles()) {
            if (file.isDirectory) {
                val found = findLrcFileInTree(file, baseName)
                if (found != null) return found
            } else {
                val name = file.name ?: continue
                if (name.substringBeforeLast(".").equals(baseName, ignoreCase = true) &&
                    name.substringAfterLast(".").equals("lrc", ignoreCase = true)) {
                    return file
                }
            }
        }
        return null
    }
}
