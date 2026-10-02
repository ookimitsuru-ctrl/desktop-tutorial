plugins {
    id("com.android.application")
}

android {
    namespace = "com.starwire.game"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.starwire.game"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // 個人配布用: デバッグ鍵で署名して、そのままサイドロード可能な APK にする
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

// ../game/dist (npm run build の成果物) を assets/www へコピー
val copyWeb = tasks.register<Copy>("copyWeb") {
    val src = rootProject.file("../game/dist")
    from(src)
    into(layout.projectDirectory.dir("src/main/assets/www"))
    doFirst {
        if (!src.resolve("index.html").exists()) {
            throw GradleException("game/dist が見つかりません。先に 'npm run build' を実行してください。")
        }
    }
}
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(copyWeb) }
