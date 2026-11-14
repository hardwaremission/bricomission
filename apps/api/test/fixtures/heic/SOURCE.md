# Photo fixtures (feature kitchen-capture-draft)

All files derive from the public-domain `infra/ai/samples/kitchen-sample.jpg` (USDA Forest
Service; see `infra/ai/samples/SOURCE.md`). Re-create them with
`apps/api/scripts/generate-heic-fixtures.sh` (it also writes `apps/web/e2e/fixtures/`).

Generator: host Node + the api's pinned `sharp` 0.35.5 for resizing, then the pinned throwaway
image `debian:trixie-20261104-slim` with `libheif-examples` / `libheif-plugin-x265`
1.23.6-2~deb13u1 (x265 4.1-2) and `libimage-exiftool-perl` 13.25. EXIF GPS (Madrid,
40.4168 N 3.7038 W, Make `FixtureCam`, Model `GPS-Test`) is injected with exiftool before
encoding; `heif-enc -q 40` copies the EXIF into the HEIC and turns EXIF orientation into an
`irot` transform.

| File | Content | Expected result |
| --- | --- | --- |
| `kitchen-gps.heic` | 1024x768 HEIC, EXIF GPS | 201; metadata-free JPEG full 1024x768, thumb 512x384 |
| `kitchen-irot90.heic` | coded 720x960 with `irot` (90 degrees), EXIF orientation 6 kept inside | 201; upright 960x720, rotated exactly once |
| `kitchen-small.heic` | 400x300 HEIC | 422 `photo_too_small` |
| `not-heic.heic` | a valid `ftyp` box (brand `heic`) followed by 4 kB of random bytes | 415 `photo_unsupported_type` |
| `kitchen-gps-orient6.jpg` | JPEG stored 768x1024 with EXIF orientation 6 and GPS | 201; full 1024x768, no EXIF/XMP/ICC |

Each file is under 200 kB.
