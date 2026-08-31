// Standalone build: the phone app never depends on this, so the APK stays clean.
pluginManagement { repositories { mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { mavenCentral() } }
rootProject.name = "preview"
