allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Some pub plugins (e.g. opencv_dart 1.4.5) ship pinned to compileSdk 33 while
// their AndroidX transitive deps require 34+. Lift every Android library plugin
// to 36 so the AAR-metadata check passes. compileSdk is independent of targetSdk/minSdk.
// Must run AFTER each plugin's own build script (which sets compileSdk), so use
// afterEvaluate — or configure directly if evaluationDependsOn already ran it.
subprojects {
    val bump: () -> Unit = {
        extensions.findByType<com.android.build.gradle.LibraryExtension>()?.let { ext ->
            if ((ext.compileSdk ?: 0) < 36) {
                ext.compileSdk = 36
            }
        }
    }
    if (state.executed) {
        bump()
    } else {
        afterEvaluate { bump() }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
