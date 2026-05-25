package com.example.musy

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private var mediaController: MediaController? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var currentTrackId: String = ""
    private val handler = Handler(Looper.getMainLooper())

    private val positionUpdater = object : Runnable {
        override fun run() {
            updatePlaybackStateInWebView()
            handler.postDelayed(this, 500)
        }
    }

    companion object {
        const val PERMISSION_REQUEST_CODE = 2002
        const val FOLDER_PICKER_REQUEST_CODE = 2003
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = true
                allowContentAccess = true
                @Suppress("DEPRECATION")
                allowFileAccessFromFileURLs = true
                @Suppress("DEPRECATION")
                allowUniversalAccessFromFileURLs = true
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    updatePlaybackStateInWebView()
                    
                    // Injects the previously selected folder name into frontend
                    val sharedPref = getSharedPreferences("musy_prefs", Context.MODE_PRIVATE)
                    val folderName = sharedPref.getString("selected_folder_name", null)
                    if (folderName != null) {
                        webView.evaluateJavascript("javascript:if(window.onFolderSelected){window.onFolderSelected('$folderName');}", null)
                    }
                }

                override fun onReceivedError(
                    view: WebView?,
                    request: android.webkit.WebResourceRequest?,
                    error: android.webkit.WebResourceError?
                ) {
                    super.onReceivedError(view, request, error)
                    if (request?.isForMainFrame == true) {
                        showErrorHtml(error?.description?.toString() ?: "Unknown WebView Error")
                    }
                }
            }
            addJavascriptInterface(WebAppInterface(this@MainActivity), "AndroidInterface")
        }
        setContentView(webView)

        // Android 15/16 Window Insets safe area handler:
        ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
            val statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars())
            val navigationBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
            val density = resources.displayMetrics.density
            val statusBarHeightDp = (statusBars.top / density).toInt()
            val navBarHeightDp = (navigationBars.bottom / density).toInt()

            val css = ":root { --status-bar-height: ${statusBarHeightDp}px; --navigation-bar-height: ${navBarHeightDp}px; }"
            webView.post {
                webView.evaluateJavascript(
                    "javascript:(function(){" +
                            "var id = 'musy-safe-area-styles';" +
                            "var old = document.getElementById(id);" +
                            "if(old) old.remove();" +
                            "var style = document.createElement('style');" +
                            "style.id = id;" +
                            "style.innerHTML = \"$css\";" +
                            "document.head.appendChild(style);" +
                            "})()",
                    null
                )
            }
            insets
        }

        checkAndRequestPermissions()
        startMediaController()
    }

    private fun showErrorHtml(errorDesc: String) {
        val html = """
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        background-color: #1a1b26;
                        color: #c0caf5;
                        font-family: sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        padding: 20px;
                        box-sizing: border-box;
                        text-align: center;
                    }
                    h1 { color: #f7768e; font-size: 24px; margin-bottom: 10px; }
                    p { color: #9ece6a; font-size: 14px; margin-bottom: 20px; }
                    button {
                        background-color: #7aa2f7;
                        color: #1a1b26;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 8px;
                        font-weight: bold;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <h1>Musy WebView Load Error</h1>
                <p>Details: $errorDesc</p>
                <button onclick="location.reload()">Reload Application</button>
            </body>
            </html>
        """.trimIndent()
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
    }

    override fun onStart() {
        super.onStart()
        handler.post(positionUpdater)
    }

    override fun onStop() {
        super.onStop()
        handler.removeCallbacks(positionUpdater)
    }

    override fun onDestroy() {
        mediaController?.let {
            it.release()
            mediaController = null
        }
        controllerFuture?.let {
            MediaController.releaseFuture(it)
        }
        super.onDestroy()
    }

    private fun checkAndRequestPermissions() {
        val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_AUDIO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }

        if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(permission),
                PERMISSION_REQUEST_CODE
            )
        } else {
            loadFrontend()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                loadFrontend()
            } else {
                Toast.makeText(
                    this,
                    "Permissions are required to scan local music files.",
                    Toast.LENGTH_LONG
                ).show()
                loadFrontend()
            }
        }
    }

    private fun loadFrontend() {
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    // --- Directory Selection Bridge ---

    fun openFolderPicker() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        startActivityForResult(intent, FOLDER_PICKER_REQUEST_CODE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FOLDER_PICKER_REQUEST_CODE && resultCode == RESULT_OK) {
            val treeUri = data?.data ?: return
            
            // Take persistable read Uri permission so we can read it on next launches
            val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION
            contentResolver.takePersistableUriPermission(treeUri, takeFlags)

            val folderName = getFolderNameFromUri(treeUri)

            // Save URI and Name in SharedPreferences
            val sharedPref = getSharedPreferences("musy_prefs", Context.MODE_PRIVATE)
            sharedPref.edit().apply {
                putString("selected_folder_uri", treeUri.toString())
                putString("selected_folder_name", folderName)
                apply()
            }

            // Push name to WebView
            webView.evaluateJavascript("javascript:if(window.onFolderSelected){window.onFolderSelected('$folderName');}", null)
            
            // Trigger frontend scan automatically
            webView.evaluateJavascript("javascript:if(window.scanLibrary){window.scanLibrary();}", null)
        }
    }

    private fun getFolderNameFromUri(uri: Uri): String {
        return try {
            val docId = DocumentsContract.getTreeDocumentId(uri)
            val parts = docId.split(":")
            if (parts.size > 1) {
                parts[1]
            } else {
                uri.lastPathSegment ?: "Library Folder"
            }
        } catch (e: Exception) {
            uri.lastPathSegment ?: "Library Folder"
        }
    }

    private fun startMediaController() {
        val sessionToken = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(this, sessionToken).buildAsync()
        controllerFuture?.addListener({
            try {
                mediaController = controllerFuture?.get()
                setupControllerListener()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }, MoreExecutors.directExecutor())
    }

    private fun setupControllerListener() {
        mediaController?.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                updatePlaybackStateInWebView()
            }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) {
                    webView.evaluateJavascript("javascript:if(window.onTrackEnded){window.onTrackEnded();}", null)
                }
                updatePlaybackStateInWebView()
            }
        })
    }

    private fun updatePlaybackStateInWebView() {
        val controller = mediaController ?: return
        val isPlaying = controller.isPlaying
        val position = controller.currentPosition
        val duration = controller.duration
        
        webView.evaluateJavascript(
            "javascript:if(window.onPlaybackStateChanged){window.onPlaybackStateChanged($isPlaying, $position, $duration, '$currentTrackId');}",
            null
        )
    }

    fun playTrack(path: String, title: String, artist: String, id: String, cover: String) {
        val controller = mediaController ?: return
        currentTrackId = id

        val metadata = MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .build()

        val mediaItem = MediaItem.Builder()
            .setUri(path)
            .setMediaId(id)
            .setMediaMetadata(metadata)
            .build()

        controller.setMediaItem(mediaItem)
        controller.prepare()
        controller.play()
        updatePlaybackStateInWebView()
    }

    fun pauseTrack() {
        mediaController?.pause()
        updatePlaybackStateInWebView()
    }

    fun resumeTrack() {
        mediaController?.play()
        updatePlaybackStateInWebView()
    }

    fun seekTrack(positionMs: Long) {
        mediaController?.seekTo(positionMs)
        updatePlaybackStateInWebView()
    }

    fun setVolume(volume: Float) {
        mediaController?.volume = volume
    }
}
