# WebView から呼ばれる JavascriptInterface のメソッドは名前を変えずに残す
-keepattributes JavascriptInterface
-keepclassmembers class com.worldstrikers.soccer.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
