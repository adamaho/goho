#!/usr/bin/env bash
set -euo pipefail

phase="${1:-after}"
case "$phase" in before|after) ;; *) echo "Usage: $0 [before|after]" >&2; exit 2;; esac
review_root="$(cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(cd -- "$review_root/../../.." && pwd)"
mkdir -p "$review_root/$phase"
cd "$repo_root/programs/goho-android"
./gradlew :app:testDebugUnitTest \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.noReceiptsLight' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.noReceiptsDark' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.smallEmpty' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.tallEmpty' \
  --tests 'com.adamaho.goho.evidence.ReceiptEvidenceTest.largeTextEmpty' \
  -I "$review_root/harness/init.gradle" \
  -Dgoho.evidence.root="$review_root" \
  -Dgoho.evidence.output="$review_root/$phase" \
  --no-daemon --max-workers=4 --no-configuration-cache --no-build-cache

cp app/build/test-results/testDebugUnitTest/TEST-com.adamaho.goho.evidence.ReceiptEvidenceTest.xml \
  "$review_root/$phase/test-results.xml"
