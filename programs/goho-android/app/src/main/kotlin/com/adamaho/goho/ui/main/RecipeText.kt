package com.adamaho.goho.ui.main

import android.content.res.Resources
import androidx.annotation.StringRes
import com.adamaho.goho.R
import com.adamaho.goho.api.generated.model.Fraction
import com.adamaho.goho.api.generated.model.Ingredient
import com.adamaho.goho.api.generated.model.MarkContent
import com.adamaho.goho.api.generated.model.Quantity
import com.adamaho.goho.api.generated.model.RecipeUnit
import com.adamaho.goho.api.generated.model.Segment
import com.adamaho.goho.api.generated.model.Step
import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode
import java.net.URI
import java.text.NumberFormat
import java.util.Locale
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * One ingredient line: [amount] is set in bold before [name] when the recipe gives a number. The
 * name is the API's wording unchanged; an amount in words follows it, as in “salt (to taste)”.
 */
internal data class IngredientLine(val amount: String?, val name: String)

/** Step wording in reading order; [Mark]s are drawn as ingredient marks. */
internal sealed interface StepPart {
    val text: String

    data class Plain(override val text: String) : StepPart

    data class Mark(override val text: String) : StepPart
}

internal fun ingredientLine(ingredient: Ingredient, resources: Resources): IngredientLine =
    when (val quantity = ingredient.quantity) {
        is Quantity.TextQuantityValue ->
            IngredientLine(
                null,
                resources.getString(
                    R.string.recipe_ingredient_text_amount,
                    ingredient.name,
                    quantity.value.text,
                ),
            )
        else ->
            IngredientLine(
                amountText(quantity, ingredient.unit, ONE, resources),
                ingredient.name,
            )
    }

/**
 * Text segments and text marks keep the API's wording exactly. An ingredient mark reads as its
 * ingredient's line, with numeric amounts scaled by the step's portion before rounding. A mark
 * whose ingredient is missing is left out, as it has no wording of its own.
 */
internal fun stepParts(
    step: Step,
    ingredients: Map<String, Ingredient>,
    resources: Resources,
): List<StepPart> =
    step.segments.mapNotNull { segment ->
        when (segment) {
            is Segment.TextSegmentValue -> StepPart.Plain(segment.value.text)
            is Segment.MarkSegmentValue ->
                when (val content = segment.value.content) {
                    is MarkContent.TextMarkValue -> StepPart.Mark(content.value.text)
                    is MarkContent.IngredientMarkValue ->
                        ingredients[content.value.ingredientId]?.let {
                            StepPart.Mark(markText(it, content.value.portion, resources))
                        }
                }
        }
    }

private fun markText(ingredient: Ingredient, portion: Fraction, resources: Resources): String {
    val share = Rational.of(portion)
    return when (val quantity = ingredient.quantity) {
        is Quantity.TextQuantityValue -> {
            val whole =
                resources.getString(
                    R.string.recipe_ingredient_text_amount,
                    ingredient.name,
                    quantity.value.text,
                )
            if (share == null || share == ONE) whole
            else
                resources.getString(
                    R.string.recipe_portion_of,
                    formatAmount(share, fractions = true, resources).text,
                    whole,
                )
        }
        else ->
            share
                ?.let { amountText(quantity, ingredient.unit, it, resources) }
                ?.let {
                    resources.getString(R.string.recipe_ingredient_amount, it, ingredient.name)
                } ?: ingredient.name
    }
}

/**
 * “25 min”, “1 hr 10 min” or “2 hr”, rounded half up to the nearest minute; zero is “0 min” and
 * 1–59 seconds is “<1 min”. Null for a negative value, which the API doesn't send.
 */
internal fun recipeDuration(seconds: Int, resources: Resources): String? {
    if (seconds < 0) return null
    if (seconds in 1..59) return resources.getString(R.string.recipe_under_a_minute)
    val minutes = (seconds.toLong() + 30) / 60
    val number = NumberFormat.getIntegerInstance(resources.locale)
    val hours = minutes / 60
    val rest = minutes % 60
    return when {
        hours == 0L -> resources.getString(R.string.recipe_minutes, number.format(rest))
        rest == 0L -> resources.getString(R.string.recipe_hours, number.format(hours))
        else ->
            resources.getString(
                R.string.recipe_hours_minutes,
                number.format(hours),
                number.format(rest),
            )
    }
}

/**
 * The source page's host, such as “examplekitchen.com”, lowercased. When the address doesn't parse
 * as a URI, the text after any scheme up to the first path, query or fragment is used instead.
 */
internal fun recipeDomain(url: String): String {
    val trimmed = url.trim()
    runCatching { URI(trimmed).host }
        .getOrNull()
        ?.takeIf { it.isNotEmpty() }
        ?.let {
            return it.lowercase(Locale.ROOT)
        }
    return trimmed.replaceFirst(SCHEME, "").split('/', '?', '#', limit = 2)[0].ifEmpty { trimmed }
}

/** The page address as saved without its scheme, such as “examplekitchen.com/lemon-orzo”. */
internal fun recipeAddress(url: String): String = url.trim().replaceFirst(SCHEME, "")

/**
 * The browser form of an http or https [url] without credentials, or null for any other address.
 * OkHttp parses it as browsers do, so international hosts, underscores and unescaped spaces are
 * accepted and come back canonical (punycode host, percent-escaped path). Display keeps the saved
 * text through [recipeAddress].
 */
internal fun recipePageUrl(url: String): String? =
    url.trim()
        .toHttpUrlOrNull()
        ?.takeIf { it.username.isEmpty() && it.password.isEmpty() }
        ?.toString()

/** What the Add recipe link field holds, checked before anything is sent. */
internal sealed interface RecipeLink {
    /** Nothing but whitespace: Add recipe does nothing and shows no error. */
    data object Blank : RecipeLink

    /** [url] is the link to send: the trimmed text, with `https://` before a bare address. */
    data class Valid(val url: String) : RecipeLink

    /** Not an http or https page address, or one with a username or password. */
    data object Invalid : RecipeLink

    /** Over the API's 2048 UTF-8 bytes as sent or once normalized. */
    data object TooLong : RecipeLink
}

/**
 * Checks pasted link text against the API's rules for a recipe page URL. The trimmed text is sent
 * as written, so the saved source keeps its own spelling; only a bare address, such as
 * “examplekitchen.com/lemon-orzo”, gains `https://`. A bare address needs a host with a dot, an IP
 * address or `localhost`, so a word or a sentence isn't taken for a site; an explicit http or https
 * address may use any host. Other schemes, such as `ftp:` or `mailto:`, are refused rather than
 * prefixed, while a port (“example.com:8080”) isn't mistaken for one. Links aren't extracted from
 * surrounding text. OkHttp parses as browsers do, accepting international hosts, underscores and
 * unescaped spaces in the path; its canonical form, without the fragment, stands in for the API's
 * normalized URL in the length check. Its percent-encoding can differ slightly from the server's
 * WHATWG parser, so a link within a few bytes of the limit may still be refused by the API.
 */
internal fun recipeLink(text: String): RecipeLink {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return RecipeLink.Blank
    val explicit = HTTP_SCHEME.containsMatchIn(trimmed)
    if (!explicit && OTHER_SCHEME.containsMatchIn(trimmed)) return RecipeLink.Invalid
    val sent = if (explicit) trimmed else "https://$trimmed"
    // Check the size before parsing, so a long paste isn't parsed at all.
    if (sent.utf8Bytes() > MAX_LINK_BYTES) return RecipeLink.TooLong
    val url = sent.toHttpUrlOrNull() ?: return RecipeLink.Invalid
    if (url.encodedUsername.isNotEmpty() || url.encodedPassword.isNotEmpty())
        return RecipeLink.Invalid
    if (!explicit && !isSiteHost(url.host)) return RecipeLink.Invalid
    if (url.newBuilder().fragment(null).build().toString().utf8Bytes() > MAX_LINK_BYTES)
        return RecipeLink.TooLong
    return RecipeLink.Valid(sent)
}

/** An IP address (IPv6 hosts keep their colons), `localhost`, or a name with a dot. */
private fun isSiteHost(host: String): Boolean {
    if (host.contains(':') || host == "localhost") return true
    val labels = host.removeSuffix(".").split('.')
    return labels.size >= 2 && labels.all { it.isNotEmpty() }
}

private fun String.utf8Bytes(): Int = encodeToByteArray().size

private const val MAX_LINK_BYTES = 2048

private val HTTP_SCHEME = Regex("^https?://", RegexOption.IGNORE_CASE)

/** A scheme such as `mailto:` or `ftp://`, but not a host followed by its port. */
private val OTHER_SCHEME = Regex("^[a-z][a-z0-9+.-]*:(?!\\d+(?:[/?#]|$))", RegexOption.IGNORE_CASE)

private val SCHEME = Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE)

private val Resources.locale: Locale
    get() = configuration.locales[0]

/** Exact positive fraction; Long numerators multiply beyond Long, so this uses BigInteger. */
private class Rational private constructor(val numerator: BigInteger, val denominator: BigInteger) {
    operator fun times(other: Rational) =
        reduced(numerator * other.numerator, denominator * other.denominator)

    override fun equals(other: Any?) =
        other is Rational && numerator == other.numerator && denominator == other.denominator

    override fun hashCode() = 31 * numerator.hashCode() + denominator.hashCode()

    companion object {
        /** Null for a zero or negative part, which the API's positive fractions rule out. */
        fun of(fraction: Fraction): Rational? =
            if (fraction.numerator <= 0 || fraction.denominator <= 0) null
            else
                reduced(
                    BigInteger.valueOf(fraction.numerator),
                    BigInteger.valueOf(fraction.denominator),
                )

        fun reduced(numerator: BigInteger, denominator: BigInteger): Rational {
            val gcd = numerator.gcd(denominator)
            return Rational(numerator / gcd, denominator / gcd)
        }
    }
}

private val ONE = Rational.reduced(BigInteger.ONE, BigInteger.ONE)

/**
 * Halves, thirds, quarters and eighths: the familiar cooking fractions that have a glyph in both
 * Geist and Geist Mono. Fifths have only ⅕, so all fifths use decimals.
 */
private val VULGAR_FRACTIONS =
    mapOf(
        (1 to 2) to "½",
        (1 to 3) to "⅓",
        (2 to 3) to "⅔",
        (1 to 4) to "¼",
        (3 to 4) to "¾",
        (1 to 8) to "⅛",
        (3 to 8) to "⅜",
        (5 to 8) to "⅝",
        (7 to 8) to "⅞",
    )

private data class Amount(val text: String, val plural: Boolean)

private class UnitLabel(
    @param:StringRes val one: Int,
    @param:StringRes val other: Int = one,
    val fractions: Boolean,
)

/**
 * Fractions read naturally for spoons, cups and counted units (cloves, cans, bunches, pinches,
 * dashes, handfuls, knobs, and counts, which have no label). Metric units use decimals.
 */
private fun unitLabel(unit: RecipeUnit?): UnitLabel? =
    when (unit) {
        RecipeUnit.millilitre -> UnitLabel(R.string.recipe_unit_millilitre, fractions = false)
        RecipeUnit.litre -> UnitLabel(R.string.recipe_unit_litre, fractions = false)
        RecipeUnit.gram -> UnitLabel(R.string.recipe_unit_gram, fractions = false)
        RecipeUnit.kilogram -> UnitLabel(R.string.recipe_unit_kilogram, fractions = false)
        RecipeUnit.tablespoon -> UnitLabel(R.string.recipe_unit_tablespoon, fractions = true)
        RecipeUnit.teaspoon -> UnitLabel(R.string.recipe_unit_teaspoon, fractions = true)
        RecipeUnit.cup ->
            UnitLabel(R.string.recipe_unit_cup_one, R.string.recipe_unit_cup_other, true)
        RecipeUnit.clove ->
            UnitLabel(R.string.recipe_unit_clove_one, R.string.recipe_unit_clove_other, true)
        RecipeUnit.can ->
            UnitLabel(R.string.recipe_unit_can_one, R.string.recipe_unit_can_other, true)
        RecipeUnit.bunch ->
            UnitLabel(R.string.recipe_unit_bunch_one, R.string.recipe_unit_bunch_other, true)
        RecipeUnit.pinch ->
            UnitLabel(R.string.recipe_unit_pinch_one, R.string.recipe_unit_pinch_other, true)
        RecipeUnit.dash ->
            UnitLabel(R.string.recipe_unit_dash_one, R.string.recipe_unit_dash_other, true)
        RecipeUnit.handful ->
            UnitLabel(R.string.recipe_unit_handful_one, R.string.recipe_unit_handful_other, true)
        RecipeUnit.knob ->
            UnitLabel(R.string.recipe_unit_knob_one, R.string.recipe_unit_knob_other, true)
        RecipeUnit.count,
        null -> null
    }

/**
 * A numeric quantity times [portion] with its unit, or null for a text quantity or an invalid
 * fraction. Both ends of a range are scaled before formatting, and a range whose ends round to the
 * same text shows that amount once.
 */
private fun amountText(
    quantity: Quantity,
    unit: RecipeUnit?,
    portion: Rational,
    resources: Resources,
): String? {
    val label = unitLabel(unit)
    val fractions = label?.fractions ?: true
    val amount =
        when (quantity) {
            is Quantity.ExactQuantityValue ->
                Rational.of(quantity.value.value)?.let {
                    formatAmount(it * portion, fractions, resources)
                }
            is Quantity.RangeQuantityValue -> {
                val min = Rational.of(quantity.value.min) ?: return null
                val max = Rational.of(quantity.value.max) ?: return null
                val low = formatAmount(min * portion, fractions, resources)
                val high = formatAmount(max * portion, fractions, resources)
                if (low.text == high.text) high
                else
                    Amount(
                        resources.getString(R.string.recipe_amount_range, low.text, high.text),
                        high.plural,
                    )
            }
            is Quantity.TextQuantityValue -> null
        } ?: return null
    return if (label == null) amount.text
    else resources.getString(if (amount.plural) label.other else label.one, amount.text)
}

/**
 * Whole numbers and familiar fractions are exact (“2½”); anything else is a decimal rounded half up
 * to at most two places. A positive value that rounds to zero reads “<0.01”. [Amount.plural]
 * follows the shown value, so 1.004 cups shows as “1 cup”.
 */
private fun formatAmount(value: Rational, fractions: Boolean, resources: Resources): Amount {
    val locale = resources.locale
    if (fractions) {
        val (whole, remainder) = value.numerator.divideAndRemainder(value.denominator)
        val plural = value.numerator > value.denominator
        val number = NumberFormat.getIntegerInstance(locale)
        if (remainder.signum() == 0) return Amount(number.format(whole), plural)
        val glyph = VULGAR_FRACTIONS[remainder.toSmallInt() to value.denominator.toSmallInt()]
        if (glyph != null)
            return Amount(
                if (whole.signum() == 0) glyph else number.format(whole) + glyph,
                plural,
            )
    }
    val rounded =
        BigDecimal(value.numerator).divide(BigDecimal(value.denominator), 2, RoundingMode.HALF_UP)
    val number =
        NumberFormat.getNumberInstance(locale).apply {
            minimumFractionDigits = 0
            maximumFractionDigits = 2
            roundingMode = RoundingMode.HALF_UP
        }
    if (rounded.signum() == 0)
        return Amount(
            resources.getString(R.string.recipe_amount_less_than, number.format(SMALLEST)),
            plural = false,
        )
    return Amount(number.format(rounded), rounded > BigDecimal.ONE)
}

private val SMALLEST = BigDecimal("0.01")

/** Fractions are reduced, so only small denominators can match a glyph; others map to -1. */
private fun BigInteger.toSmallInt(): Int = if (bitLength() < 8) toInt() else -1
