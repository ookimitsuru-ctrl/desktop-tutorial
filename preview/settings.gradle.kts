// プレビューはアプリ本体とは独立したビルド。
// Android SDK が無い環境 (CI やサーバー) でも惑星の絵を確認できるようにしてある。
pluginManagement {
    repositories {
        maven { url = uri("https://repo1.maven.org/maven2") } // Maven Central
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        maven { url = uri("https://repo1.maven.org/maven2") } // Maven Central
    }
}
rootProject.name = "planetgrow-preview"
