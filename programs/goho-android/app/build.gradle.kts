import com.android.build.api.variant.BuildConfigField
import com.ncorti.ktfmt.gradle.tasks.KtfmtCheckTask
import com.ncorti.ktfmt.gradle.tasks.KtfmtFormatTask
import java.net.URI
import org.openapitools.generator.gradle.plugin.tasks.GenerateTask

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.ktfmt)
    alias(libs.plugins.openapi.generator)
    alias(libs.plugins.kotlin.serialization)
}

ktfmt { kotlinLangStyle() }

val generatedClientDir = layout.buildDirectory.dir("generated/openapi")
val checkedInClientDir =
    layout.projectDirectory.dir("src/main/kotlin/com/adamaho/goho/api/generated")
val gohoServerUrl = providers.gradleProperty("gohoServerUrl").orElse("http://127.0.0.1:3000").get()
val productionServerUrl = providers.gradleProperty("gohoProductionServerUrl").orElse("")

tasks.withType<KtfmtCheckTask>().configureEach { exclude("**/api/generated/**") }

tasks.withType<KtfmtFormatTask>().configureEach { exclude("**/api/generated/**") }

tasks.register<Sync>("updateOpenApiClient") {
    dependsOn(tasks.named<GenerateTask>("openApiGenerate"))
    from(generatedClientDir.map { it.dir("src/main/kotlin/com/adamaho/goho/api/generated") })
    into(checkedInClientDir)
}

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
    compileSdk = 37

    defaultConfig {
        applicationId = "com.adamaho.goho"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    flavorDimensions += "environment"
    productFlavors {
        create("development") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            buildConfigField("String", "GOHO_SERVER_URL", "\"$gohoServerUrl\"")
        }
        create("production") { dimension = "environment" }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

androidComponents {
    onVariants(selector().withFlavor("environment" to "production")) { variant ->
        variant.buildConfigFields?.put(
            "GOHO_SERVER_URL",
            productionServerUrl.map { value ->
                val url =
                    try {
                        URI(value)
                    } catch (_: java.net.URISyntaxException) {
                        null
                    }
                require(url?.scheme == "https" && !url.host.isNullOrBlank()) {
                    "Production builds require -PgohoProductionServerUrl=https://your-server"
                }
                BuildConfigField("String", "\"${url.toASCIIString()}\"", null)
            },
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
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    implementation(libs.play.services.mlkit.document.scanner)

    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.kotlin.reflect)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.core)
    implementation(libs.moshi.kotlin)
    implementation(libs.moshi.adapters)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.moshi)
    implementation(libs.retrofit.converter.scalars)
    coreLibraryDesugaring(libs.desugar.jdk.libs)
}
