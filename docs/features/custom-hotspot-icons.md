# Custom Hotspot Icons

Hotspots can be customized with different icons, colors, and sizes.

Related docs:
- Hotspot schema: `../00-conventions.md`
- Hotspot behavior: `hotspots-interactivity.md`

## MVP scope

- Predefined icon set for each hotspot type.
- Color and size customization per hotspot.
- Icon picker component in the hotspot editor.

## Icon picker

The HotspotIconPicker component provides:

- A searchable grid of predefined icons.
- Icons are organized by category (navigation, information, media, general).
- Preview of the selected icon with current color and size.

## Hotspot appearance fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `icon_name` | string | type-specific | Icon identifier from the predefined set |
| `icon_color` | string | `#ffffff` | Hex color code for the icon |
| `icon_size` | number | 32 | Icon size in pixels (1-100) |

## Default icons by type

| Hotspot Type | Default Icon |
|-------------|-------------|
| navigation | Arrow/chevron |
| info | Info circle |
| audio | Speaker/music |
| video | Play button |
| link | External link |
| custom | Star/generic |

## Rendering

- Icons are rendered as interactive markers on the 360 viewer.
- Hover state shows the hotspot title as a tooltip.
- Click triggers the type-specific action (navigate, show info, play media, etc.).

**Document Links**:
- [Hotspots & Interactivity](hotspots-interactivity.md) ← Related
- [Features Index](README.md) ← Back
