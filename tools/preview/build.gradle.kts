import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm") version "2.0.21"
    application
}

repositories { mavenCentral() }

val lwjglVersion = "3.4.3"
val lwjglNatives = "natives-linux"

dependencies {
    implementation(platform("org.lwjgl:lwjgl-bom:$lwjglVersion"))
    implementation("org.lwjgl:lwjgl")
    implementation("org.lwjgl:lwjgl-egl")
    implementation("org.lwjgl:lwjgl-opengles")
    runtimeOnly("org.lwjgl:lwjgl::$lwjglNatives")
    runtimeOnly("org.lwjgl:lwjgl-opengles::$lwjglNatives")
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_21) } }

sourceSets {
    main {
        kotlin.setSrcDirs(
            listOf(
                "src/main/kotlin",
                "../../core/src/main/kotlin",
                "../../app/src/main/kotlin",
            ),
        )
        // Everything that needs a real Activity or a real touchscreen stays out.
        kotlin.exclude("**/MainActivity.kt", "**/GameView.kt")
    }
}

application {
    mainClass.set("preview.Preview")
}

tasks.named<JavaExec>("run") {
    workingDir = projectDir
    environment("EGL_PLATFORM", "surfaceless")
    environment("LIBGL_ALWAYS_SOFTWARE", "1")
    args = (project.findProperty("shotArgs") as String? ?: "shots 1600 900").split(" ")
}
