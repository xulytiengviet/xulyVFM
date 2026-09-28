# VFM Feature + CVNSS4.0 Text Profile 1

Profile identifier:

```
org.xulytiengviet.vfm.feature-cvnss4/1
```

Status: experimental profile above the frozen VFM Core 1.3. It does not modify Header, Root Directory Entry, ChunkDescriptor, META, PROF or HASH structures.

## Section

- FourCC: `FEAT`
- `profile_id`: index of this profile in `PROF` (1-based)
- section version: 1
- payload encoding: UTF-8 JSON
- compression/encryption: Core-compatible values; reference writer currently emits NONE/NONE.

## Logical payload

```json
{
  "schema": 1,
  "profile": "org.xulytiengviet.vfm.feature-cvnss4/1",
  "crs": "OGC:CRS84",
  "source": {"format": "KML 2.2", "fileName": "example.kml"},
  "featureCount": 1,
  "features": [
    {
      "id": "vfm:kml:...",
      "geometry": {"type": "Point", "coordinates": [105.0, 10.0]},
      "properties": {"name": "Tên địa lý Unicode"},
      "cv4": {"name": "CVNSS4.0 derived key"}
    }
  ]
}
```

## Text rule

1. `properties.*` is authoritative source Unicode when the source contains Unicode.
2. `cv4.*` is a deterministic derived CVNSS4.0 representation produced by CVNSS4.0 Converter 5.0.0-audit-safe.
3. CVNSS4.0 MUST NOT be used as the sole stable VFM entity identity because the encoding contains many-to-one cases.
4. Readers MAY derive a missing `cv4[field]` from the Unicode value; writers SHOULD materialize it when the dataset is intended for CVNSS4 search/index use.
5. A reverse conversion from CVNSS4.0 is canonical/candidate-aware, not proof that the reconstructed text is identical to the original source. The original Unicode remains authoritative.

## KML mapping

- Placemark → feature
- name/description/ExtendedData → `properties`
- Point/LineString/Polygon/MultiGeometry → GeoJSON-like `geometry`
- source KML CRS → `OGC:CRS84`
- each textual property → matching key in `cv4`

This profile is deliberately additive so generic VFM Core readers can validate and skip the FEAT payload when they do not implement the profile.
