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
    // The default BigDecimal has no serializer for numeric enums. Money and IDs remain strings.
    typeMappings.set(mapOf("number" to "kotlin.Double"))
    // Generated wrappers can't compile a string-or-number union once number maps to Double.
    schemaMappings.set(
        mapOf(
            "BadRequestProblemEncoded_errors_inner_path_inner" to
                "kotlinx.serialization.json.JsonPrimitive"
        )
    )
    // Top-level enums decode numeric statuses as numbers, without lenient Json.
    inlineSchemaOptions.set(mapOf("RESOLVE_INLINE_ENUMS" to "true"))
    // Identical inline enums reuse the model of whichever schema the generator meets first, before
    // this mapping applies. Map every schema that repeats an enum, so spec order can't rename it.
    inlineSchemaNameMappings.set(
        mapOf(
                "ProblemStatus404" to
                    listOf(
                        "BookImageNotFound_status",
                        "BookNotFound_status",
                        "BookUploadNotFound_status",
                        "ReceiptImageNotFound_status",
                        "ReceiptItemNotFound_status",
                        "ReceiptNotFound_status",
                        "ReceiptUploadNotFound_status",
                        "RecipeImageNotFound_status",
                        "RecipeNotFound_status",
                        "RecipeUploadNotFound_status",
                    ),
                "ProblemStatus409" to
                    listOf(
                        "BookConflict_status",
                        "BookUploadConflict_status",
                        "ReceiptUploadConflict_status",
                        "RecipeUploadConflict_status",
                    ),
                "ProblemStatus500" to
                    listOf(
                        "BooksUnavailable_status",
                        "BookUploadsUnavailable_status",
                        "InternalServerErrorProblemEncoded_status",
                        "ReceiptsUnavailable_status",
                        "ReceiptUploadsUnavailable_status",
                        "RecipesUnavailable_status",
                        "RecipeUploadsUnavailable_status",
                    ),
                "AboutBlankProblemType" to
                    listOf(
                        "BadRequestProblemEncoded_type",
                        "InternalServerErrorProblemEncoded_type",
                    ),
                "ReceiptUploadContentType" to
                    listOf(
                        "receiptUploads_create_202_response_data_contentType",
                        "receiptUploads_get_200_response_data_contentType",
                        "receiptUploads_list_200_response_data_inner_contentType",
                    ),
                "ReceiptUploadFailureCode" to
                    listOf(
                        "receiptUploads_create_202_response_data_failureCode",
                        "receiptUploads_get_200_response_data_failureCode",
                        "receiptUploads_list_200_response_data_inner_failureCode",
                    ),
                "ReceiptUploadStatus" to
                    listOf(
                        "receiptUploads_create_202_response_data_status",
                        "receiptUploads_get_200_response_data_status",
                        "receiptUploads_list_200_response_data_inner_status",
                    ),
                "TextKind" to listOf("TextMark_kind", "TextQuantity_kind", "TextSegment_kind"),
            )
            .flatMap { (name, keys) -> keys.map { it to name } }
            .toMap()
    )
    configOptions.set(
        mapOf(
            "dateLibrary" to "string",
            "generateOneOfAnyOfWrappers" to "true",
            "serializationLibrary" to "kotlinx_serialization",
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
        minSdk = 36
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
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.kotlinx.serialization)
    implementation(libs.retrofit.converter.scalars)
    coreLibraryDesugaring(libs.desugar.jdk.libs)
}
