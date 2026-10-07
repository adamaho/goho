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
  -I "$tool_root/harness/init.gradle" \
  -Dgoho.evidence.root="$tool_root" \
  -Dgoho.evidence.output="$output_root" \
  --no-daemon --max-workers=4 --no-configuration-cache --no-build-cache

cp app/build/test-results/testDebugUnitTest/TEST-com.adamaho.goho.evidence.ReceiptEvidenceTest.xml \
  "$output_root/test-results.xml"
