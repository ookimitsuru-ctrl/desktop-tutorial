// デスクトップ用プレビュー。
// アプリ本体と同じ描画コード (../app/src/main/java/com/example/planetgrow/core) を
// そのままコンパイルして PNG を書き出す。
//
//   cd preview && ../gradlew run
//   cd preview && ../gradlew run --args="out 12 06:00 12:00 19:00 23:00"
plugins {
    id("org.jetbrains.kotlin.jvm") version "1.9.24"
    application
}

sourceSets {
    main {
        // コピーではなくアプリ本体のファイルを直接参照する (ズレが起きない)
        kotlin.srcDir("../app/src/main/java/com/example/planetgrow/core")
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions.jvmTarget = "17"
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

application {
    mainClass.set("com.example.planetgrow.preview.PreviewMainKt")
}

tasks.withType<JavaExec>().configureEach {
    defaultCharacterEncoding = "UTF-8"
}
