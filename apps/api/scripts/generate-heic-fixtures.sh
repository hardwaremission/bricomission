#!/usr/bin/env bash
# Re-creates the photo fixtures of feature kitchen-capture-draft from the public-domain
# infra/ai/samples/kitchen-sample.jpg (see its SOURCE.md):
#   apps/api/test/fixtures/heic/{kitchen-gps.heic,kitchen-irot90.heic,kitchen-small.heic,
#     not-heic.heic,kitchen-gps-orient6.jpg}
#   apps/web/e2e/fixtures/{kitchen-1.jpg,kitchen-2.jpg,kitchen-3.heic}
#
# Step 1 (host Node + the api's pinned sharp): resize/crop base JPEGs.
# Step 2 (pinned throwaway container, libheif 1.23.6 + x265, exiftool 13.25): inject
# EXIF GPS (and orientation 6), encode HEIC with heif-enc. heif-enc copies the JPEG's
# EXIF into the HEIC and turns EXIF orientation into an `irot` transform.
# Usage: apps/api/scripts/generate-heic-fixtures.sh   (needs node, docker; network for apt)
set -euo pipefail

IMAGE="debian:trixie-20261104-slim"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_OUT="$REPO/apps/api/test/fixtures/heic"
WEB_OUT="$REPO/apps/web/e2e/fixtures"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$API_OUT" "$WEB_OUT"

cp "$REPO/infra/ai/samples/kitchen-sample.jpg" "$WORK/sample.jpg"
(cd "$REPO/apps/api" && node --input-type=module -e "
import sharp from 'sharp';
const dir = process.argv[1];
const src = dir + '/sample.jpg';
await sharp(src).resize(1024, 768).jpeg({ quality: 80 }).toFile(dir + '/base-gps.jpg');
// Stored upright as 720x960 (portrait); orientation 6 is added later, so a correct
// decoder shows a 960x720 landscape image.
await sharp(await sharp(src).resize(960, 720).toBuffer()).rotate(-90).jpeg({ quality: 80 }).toFile(dir + '/base-irot.jpg');
await sharp(src).resize(400, 300).jpeg({ quality: 80 }).toFile(dir + '/base-small.jpg');
await sharp(await sharp(src).resize(1024, 768).toBuffer()).rotate(-90).jpeg({ quality: 82 }).toFile(dir + '/base-orient6.jpg');
await sharp(src).extract({ left: 0, top: 0, width: 1200, height: 900 }).resize(1024, 768).jpeg({ quality: 78 }).toFile(dir + '/kitchen-1.jpg');
await sharp(src).extract({ left: 400, top: 300, width: 1200, height: 900 }).resize(1024, 768).jpeg({ quality: 78 }).toFile(dir + '/kitchen-2.jpg');
await sharp(src).extract({ left: 200, top: 100, width: 1200, height: 900 }).resize(1024, 768).jpeg({ quality: 85 }).toFile(dir + '/base-web-heic.jpg');
" "$WORK")

docker run --rm --user 0 -v "$WORK:/w" "$IMAGE" bash -euo pipefail -c '
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends libheif-examples libheif-plugin-x265 libheif-plugin-libde265 libimage-exiftool-perl >/dev/null
cd /w
GPS=(-GPSLatitude=40.4168 -GPSLatitudeRef=N -GPSLongitude=3.7038 -GPSLongitudeRef=W -GPSAltitude=667 -Make=FixtureCam -Model=GPS-Test)
exiftool -q -overwrite_original "${GPS[@]}" base-gps.jpg base-small.jpg base-web-heic.jpg
exiftool -q -overwrite_original "${GPS[@]}" -Orientation#=6 base-irot.jpg base-orient6.jpg
heif-enc -q 40 -o kitchen-gps.heic base-gps.jpg >/dev/null
heif-enc -q 40 -o kitchen-irot90.heic base-irot.jpg >/dev/null
heif-enc -q 40 -o kitchen-small.heic base-small.jpg >/dev/null
heif-enc -q 40 -o kitchen-3.heic base-web-heic.jpg >/dev/null
# Corrupt HEIC: a valid ftyp box (brand heic) followed by garbage.
head -c 32 kitchen-gps.heic > not-heic.heic
head -c 4096 /dev/urandom >> not-heic.heic
cp base-orient6.jpg kitchen-gps-orient6.jpg
chown -R '"$(id -u):$(id -g)"' /w
echo "libheif: $(dpkg-query -W -f="\${Version}" libheif-examples), x265: $(dpkg-query -W -f="\${Version}" libx265-215), exiftool: $(exiftool -ver)"
'

cp "$WORK"/{kitchen-gps.heic,kitchen-irot90.heic,kitchen-small.heic,not-heic.heic,kitchen-gps-orient6.jpg} "$API_OUT/"
cp "$WORK"/{kitchen-1.jpg,kitchen-2.jpg,kitchen-3.heic} "$WEB_OUT/"
ls -l "$API_OUT" "$WEB_OUT"
