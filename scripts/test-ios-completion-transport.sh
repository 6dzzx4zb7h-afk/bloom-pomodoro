#!/bin/bash
# Run against a booted iOS Simulator; optionally pass its UUID as argument 1.
# Exercises the real Swift transport with fake OS notification delivery.
set -euo pipefail

cd "$(dirname "$0")/.."
bloom_transport_test_dir=$(mktemp -d "${TMPDIR:-/tmp}/bloom-native-tests.XXXXXX")
trap 'rm -rf "$bloom_transport_test_dir"' EXIT
bloom_transport_sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
bloom_transport_arch=$(uname -m)

xcrun --sdk iphonesimulator swiftc \
  -target "${bloom_transport_arch}-apple-ios17.0-simulator" \
  -sdk "$bloom_transport_sdk" \
  -module-cache-path "$bloom_transport_test_dir/ModuleCache" \
  -parse-as-library \
  ios/App/Shared/BloomCompletionAlertTransport.swift \
  scripts/ios-completion-transport-tests.swift \
  -o "$bloom_transport_test_dir/transport-tests"

xcrun simctl spawn "${1:-booted}" "$bloom_transport_test_dir/transport-tests"
