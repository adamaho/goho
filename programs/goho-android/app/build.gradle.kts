import org.openapitools.generator.gradle.plugin.tasks.GenerateTask

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.ktfmt)
    alias(libs.plugins.openapi.generator)
}

ktfmt { kotlinLangStyle() }

val generatedClientDir = layout.buildDirectory.dir("generated/openapi")

openApiGenerate {
    generatorName.set("kotlin")
    inputSpec.set(rootProject.file("../../packages/goho-api/openapi.json").absolutePath)
    outputDir.set(generatedClientDir)
    cleanupOutput.set(true)
    apiPackage.set("com.adamaho.goho.api.generated")
    packageName.set("com.adamaho.goho.api.generated")
    modelPackage.set("com.adamaho.goho.api.generated.model")
    library.set("jvm-retrofit2")
    configOptions.set(
        mapOf(
            "dateLibrary" to "string",
            "serializationLibrary" to "moshi",
            "useCoroutines" to "true",
        )
    )
    globalProperties.set(
        mapOf(
            "apiDocs" to "false",
            "modelDocs" to "false",
            "apiTests" to "false",
            "modelTests" to "false",
        )
    )
}

android {
    namespace = "com.adamaho.goho"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.adamaho.goho"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    buildFeatures { compose = true }
}

androidComponents {
    onVariants(selector().all()) { variant ->
        variant.sources.kotlin?.addGeneratedSourceDirectory(
            tasks.named<GenerateTask>("openApiGenerate"),
            GenerateTask::outputDir,
        )
    }
}

kotlin { jvmToolchain(17) }

dependencies {
    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)

    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.kotlin.reflect)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.moshi.kotlin)
    implementation(libs.moshi.adapters)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.moshi)
    implementation(libs.retrofit.converter.scalars)
    coreLibraryDesugaring(libs.desugar.jdk.libs)
}
