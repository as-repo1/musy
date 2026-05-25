package com.example.musy

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.documentfile.provider.DocumentFile
import com.google.gson.Gson

class MediaStoreScanner(private val context: Context) {

    fun scanAudioFilesJson(): String {
        val sharedPref = context.getSharedPreferences("musy_prefs", Context.MODE_PRIVATE)
        val folderUriStr = sharedPref.getString("selected_folder_uri", null)
        
        val tracksList = if (folderUriStr != null) {
            val resolvedPath = resolveUriToPath(folderUriStr)
            if (resolvedPath != null) {
                // High-performance query via MediaStore using directory path filter
                scanAudioFilesFromMediaStore(resolvedPath)
            } else {
                // Fallback to recursive SAF document provider query
                scanAudioFilesFromSAF(folderUriStr)
            }
        } else {
            // No custom folder chosen, scan all music files on device
            scanAudioFilesFromMediaStore(null)
        }
        
        return Gson().toJson(tracksList)
    }

    private fun resolveUriToPath(uriStr: String): String? {
        return try {
            val uri = Uri.parse(uriStr)
            val docId = DocumentsContract.getTreeDocumentId(uri)
            val parts = docId.split(":")
            if (parts.size > 1) {
                val relativePath = parts[1]
                if (parts[0].equals("primary", ignoreCase = true)) {
                    "/storage/emulated/0/$relativePath"
                } else {
                    "/storage/${parts[0]}/$relativePath"
                }
            } else {
                null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun scanAudioFilesFromMediaStore(folderPath: String?): List<AndroidTrack> {
        val tracks = mutableListOf<AndroidTrack>()
        val uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA
        )

        var selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} >= 5000"
        var selectionArgs: Array<String>? = null

        if (folderPath != null) {
            // Filter by folder path
            selection += " AND ${MediaStore.Audio.Media.DATA} LIKE ?"
            selectionArgs = arrayOf("$folderPath/%")
        }

        val sortOrder = "${MediaStore.Audio.Media.TITLE} ASC"

        val cursor = context.contentResolver.query(
            uri,
            projection,
            selection,
            selectionArgs,
            sortOrder
        )

        cursor?.use { c ->
            val idCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val titleCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
            val artistCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            val albumCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
            val albumIdCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
            val durationCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val dataCol = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)

            while (c.moveToNext()) {
                val id = c.getLong(idCol).toString()
                val title = c.getString(titleCol) ?: "Unknown Track"
                val artist = c.getString(artistCol) ?: "Unknown Artist"
                val album = c.getString(albumCol) ?: "Unknown Album"
                val albumId = c.getLong(albumIdCol)
                val durationMs = c.getLong(durationCol)
                val path = c.getString(dataCol) ?: ""

                val artUri = ContentUris.withAppendedId(
                    Uri.parse("content://media/external/audio/albumart"),
                    albumId
                ).toString()

                tracks.add(
                    AndroidTrack(
                        id = id,
                        title = title,
                        artist = artist,
                        album = album,
                        duration = durationMs / 1000,
                        path = path,
                        cover = artUri
                    )
                )
            }
        }

        return tracks
    }

    private fun scanAudioFilesFromSAF(uriStr: String): List<AndroidTrack> {
        val tracks = mutableListOf<AndroidTrack>()
        try {
            val treeUri = Uri.parse(uriStr)
            val pickedDir = DocumentFile.fromTreeUri(context, treeUri) ?: return tracks
            scanSAFDirectoryRecursive(pickedDir, tracks)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return tracks
    }

    private fun scanSAFDirectoryRecursive(dir: DocumentFile, tracks: MutableList<AndroidTrack>) {
        val audioExtensions = listOf("mp3", "m4a", "flac", "ogg", "wav", "aac")
        for (file in dir.listFiles()) {
            if (file.isDirectory) {
                scanSAFDirectoryRecursive(file, tracks)
            } else {
                val name = file.name ?: continue
                val ext = name.substringAfterLast('.', "").lowercase()
                if (audioExtensions.contains(ext)) {
                    val track = parseMetadataFromUri(file.uri, name)
                    if (track != null) {
                        tracks.add(track)
                    }
                }
            }
        }
    }

    private fun parseMetadataFromUri(uri: Uri, fileName: String): AndroidTrack? {
        val retriever = android.media.MediaMetadataRetriever()
        try {
            retriever.setDataSource(context, uri)
            val title = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_TITLE) 
                ?: fileName.substringBeforeLast('.')
            val artist = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ARTIST) 
                ?: "Unknown Artist"
            val album = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_ALBUM) 
                ?: "Unknown Album"
            val durationStr = retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)
            val durationS = (durationStr?.toLongOrNull() ?: 0L) / 1000

            return AndroidTrack(
                id = uri.toString(),
                title = title,
                artist = artist,
                album = album,
                duration = durationS,
                path = uri.toString(), // Passes content Uri to ExoPlayer directly
                cover = ""
            )
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            retriever.release()
        }
        return null
    }

    data class AndroidTrack(
        val id: String,
        val title: String,
        val artist: String,
        val album: String,
        val duration: Long,
        val path: String,
        val cover: String
    )
}
