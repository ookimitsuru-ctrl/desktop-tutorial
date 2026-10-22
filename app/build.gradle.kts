import org.apache.tools.ant.taskdefs.condition.Os

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

base {
    archivesName.set("WorldStrikers-v1.1.1")
}

android {
    namespace = "com.worldstrikers.soccer"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.worldstrikers.soccer"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.1.1"
    }

    signingConfigs {
        // 同じ鍵で署名しておくと、ローカルビルドとCIビルドのAPKを上書きインストールできる
        create("shared") {
            storeFile = file("signing.keystore")
            storePassword = "worldstrikers"
            keyAlias = "worldstrikers"
            keyPassword = "worldstrikers"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("shared")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    androidResources {
        // ゲームのJSやテクスチャを無圧縮で格納しておくとWebViewからの読み込みが速い
        noCompress += listOf("js", "html", "css", "woff2", "png", "jpg")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
}

// web/ のゲーム本体（Three.js）をビルドして app/src/main/assets/game に出力する
val webDir = rootProject.file("web")
val npm = if (Os.isFamily(Os.FAMILY_WINDOWS)) "npm.cmd" else "npm"

val installWebDeps by tasks.registering(Exec::class) {
    workingDir = webDir
    commandLine(npm, "ci", "--no-audit", "--no-fund")
    inputs.file(File(webDir, "package-lock.json"))
    outputs.dir(File(webDir, "node_modules"))
}

val buildWebGame by tasks.registering(Exec::class) {
    dependsOn(installWebDeps)
    workingDir = webDir
    commandLine(npm, "run", "build")
    inputs.dir(File(webDir, "src"))
    inputs.file(File(webDir, "index.html"))
    inputs.file(File(webDir, "build.mjs"))
    inputs.file(File(webDir, "fonts.mjs"))
    inputs.file(File(webDir, "package-lock.json"))
    outputs.dir(file("src/main/assets/game"))
}

tasks.named("preBuild") {
    dependsOn(buildWebGame)
}
