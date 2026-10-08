#!/usr/bin/env bash
set -euo pipefail

if (( $# > 1 )); then
  echo "Usage: $0 [output-directory]" >&2
  exit 2
fi

tool_root="$(cd -- "$(dirname -- "$0")" && pwd)"
android_root="$(cd -- "$tool_root/../.." && pwd)"
output_root="${1:-$android_root/build/bram-captures}"
mkdir -p "$output_root"
output_root="$(cd -- "$output_root" && pwd)"

cd "$android_root"
./gradlew :app:testDebugUnitTest \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.noReceiptsLight' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.noReceiptsDark' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.smallEmpty' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.tallEmpty' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.largeTextEmpty' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.noAttentionLight' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.noAttentionDark' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.loadErrorLight' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.loadErrorDark' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.largeTextError' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.largeTextAttention' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.retryFailureAndSuccess' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.deleteLastFailedOverall' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.initialLoadingLight' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.initialLoadingDark' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.initialLoadingFastSuccessDoesNotFlash' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.backgroundRefreshStaysQuiet' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.retryFastSuccessDoesNotFlashDuringRecovery' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.largeTextRetryProgressKeepsBounds' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.reducedMotionProgressStaysStatic' \
  -I "$tool_root/harness/init.gradle" \
  -Dgoho.evidence.root="$tool_root" \
  -Dgoho.evidence.output="$output_root" \
  --no-daemon --max-workers=4 --no-configuration-cache --no-build-cache

cp app/build/test-results/testDebugUnitTest/TEST-com.adamaho.goho.evidence.ReceiptEvidenceTest.xml \
  "$output_root/test-results.xml"
