# Libraries ship their own R8 rules; add a rule here only for a proven need, with the reason.

# Keep class and member names so logcat crash traces stay readable without a mapping file.
-dontobfuscate

# Deletion checks call these uploads lookups only for their status, so the app never reads the
# body type. R8 would remove it and rewrite Response<T> to Response<Object>, which has no converter,
# so Retrofit would fail the call. Add any other Retrofit result whose body is never read.
-keep class com.adamaho.goho.api.generated.model.BookUploadsGet200Response
-keep class com.adamaho.goho.api.generated.model.RecipeUploadsGet200Response
