# Architectural Best Practices for FloorScript Floor Plans

Reference this file when generating or reviewing floor plans. These guidelines reflect US residential building code (IRC/NEC) and common architectural practice. Apply them as defaults unless the user specifies otherwise.

---

## Door Placement and Swing Direction

### Swing Direction Rules

Doors should swing **into the room they serve**, away from hallways and circulation paths. The open door should come to rest flat against the nearest perpendicular wall, not blocking the room.

| Room Type | Swing Direction | Notes |
|-----------|----------------|-------|
| Bedroom | Into bedroom | Privacy; keeps hallway clear |
| Bathroom | Into bathroom | Outward acceptable if the arc would hit the toilet or vanity |
| Closet | Out of closet (into parent room) | Maximizes closet interior; avoids hitting shelves |
| Walk-in closet | Into closet is acceptable | Larger closets can accommodate inward swing |
| Exterior/Entry | Into the house | Standard US convention |
| Utility/Mechanical | Into utility room | Keeps hallway clear |

### Hinge Side Selection

Choose the hinge side so the door swings toward the nearest perpendicular wall. The **light switch must be on the latch side** (the side you reach first when entering), never hidden behind the open door.

In FloorScript terms:
- `swing: inward-left` — hinge on the left when facing the door from outside the room
- `swing: inward-right` — hinge on the right when facing the door from outside the room

**Practical check:** When a door is on a vertical wall (east/west) and the user wants it to swing toward the south wall of the room, use the swing direction that places the arc toward the south. Verify visually after rendering.

### Standard Door Sizes

| Location | Width | FloorScript `width` |
|----------|-------|---------------------|
| Exterior / front entry | 36" | `3ft` |
| Bedroom | 30"–32" | `2ft 6in` or `2ft 8in` |
| Bathroom | 28"–30" | `2ft 4in` or `2ft 6in` |
| Walk-in closet | 30"–32" | `2ft 6in` |
| Reach-in closet (bifold) | 24"–48" | `2ft`–`4ft` with `style: bifold` |
| Cased opening / pass-through | 4ft–6ft | Use `style: cased-opening` |

### Clearances

- Minimum **32" clear opening width** for accessibility (a 2ft 8in door leaf provides this).
- Leave at least **2"–6"** between a door opening and a perpendicular wall (avoid placing a door flush into a corner — it feels cramped and blocks the switch).
- A door's swing arc must not conflict with another door's swing arc, a toilet, or a vanity.

---

## Window Placement

### Distance from Corners and Wall Intersections

- Keep windows at least **12"–16"** from inside corners (room corners, enclosure/extension wall junctions). This preserves structural framing and looks intentional.
- **Never place a window so it overlaps an enclosure or extension wall intersection.** If an enclosure starts 4ft from a corner, end the window before that point.
- In FloorScript, verify that `from`/`offset` + `width` does not cross into an enclosure or extension boundary on the same wall.

### Egress Requirements (Bedrooms)

Every bedroom must have at least one window that meets emergency escape minimums:
- Net clear opening: **5.7 sq ft** (5.0 sq ft at grade)
- Minimum **24" height**, **20" width**
- Sill no higher than **44"** from floor
- A **3ft × 4ft** casement or double-hung window is the most common egress-compliant choice

### Typical Window Sizes by Room

| Room | Typical Width | FloorScript `width` |
|------|--------------|---------------------|
| Living room | 4ft–6ft | `4ft`–`6ft` |
| Bedroom | 3ft–4ft | `3ft`–`4ft` |
| Kitchen (over sink) | 3ft–4ft | `3ft`–`4ft` |
| Bathroom | 2ft–3ft | `2ft`–`3ft` |
| Bay window extension | 3ft–5ft | `3ft`–`5ft` |

### Placement Conventions

- Center windows on the wall when possible (`position: center`) — it looks balanced from both inside and outside.
- When a room has multiple windows on the same wall, space them symmetrically.
- Kitchen windows go above the counter (typically over the sink wall).
- Bathroom windows should be higher or use frosted glass — note this in the label or a comment.

---

## Electrical Outlet and Switch Placement

### Outlet Spacing (NEC 210.52 — "6/12 Rule")

No point along any wall should be more than **6 feet** from an outlet. In practice:
- Place an outlet every **12 feet** along a continuous wall.
- Every wall segment **2 feet or wider** needs at least one outlet.
- Door openings and fireplaces break the wall into separate segments; each segment follows the rule independently.

**FloorScript placement:** Use `wall: roomid.direction` with `position` offsets spaced ≤12ft apart. Start the first outlet ~1ft from a corner or door frame.

### Kitchen Counter Outlets

- No point along a countertop more than **24"** from an outlet (effectively every **4 feet**).
- Two dedicated **20A** small-appliance circuits required.
- All kitchen outlets require **GFCI** protection (`type: gfci`).

### GFCI Requirements by Location

Use `type: gfci` for outlets in:
- Kitchens (all outlets)
- Bathrooms (all outlets)
- Garages
- Laundry rooms
- Outdoors
- Unfinished basements
- Within 6ft of any sink (in any room)

Use `type: duplex` for standard outlets in bedrooms, living rooms, and other dry locations.

### Switch Placement

- Place switches on the **latch side of the door** (the side the handle is on), so the switch is immediately accessible when entering — not hidden behind the open door.
- Standard height: **48"** from floor (FloorScript positions switches with wall-relative offsets).
- Every room needs a switch-controlled light at each entry point.
- Use **three-way switches** (`type: three-way`) at both ends of hallways and at top/bottom of stairs.
- Closets: switch just outside the closet door.

### Outlet Heights

| Type | Height | Notes |
|------|--------|-------|
| Standard wall outlet | 12"–16" AFF | Use `type: duplex` |
| Kitchen countertop | 42"–44" AFF | Use `type: gfci` |
| Bathroom vanity | 42"–44" AFF | Use `type: gfci` |
| Dedicated appliance (dryer, range) | 12"–16" AFF | Use `type: 240v` |

---

## Plumbing Fixture Placement

### Toilet

- **Centerline to nearest side wall or fixture:** 15" minimum, 18" preferred.
- **Clear space in front:** 21" minimum, 30" recommended.
- **Rough-in centerline to back wall:** 12" (standard).
- Orient the toilet **perpendicular to the wall it backs against**.
- Never place a toilet directly in the path of an inward-swinging door — the door arc must clear a seated person.

In FloorScript: use `wall: roomid.direction` to back the toilet against a wall. Set `orientation` so the bowl faces into the room:

| Toilet wall | `orientation` |
|-------------|---------------|
| North wall (backs to north) | `facing-south` |
| South wall (backs to south) | `facing-north` |
| East wall (backs to east) | `facing-west` |
| West wall (backs to west) | `facing-east` |

### Sink / Vanity

- **Centerline to side wall:** 15" minimum, 20" preferred.
- **Clear space in front:** 21" minimum, 30" recommended.
- Place sinks against the wall where plumbing supply and drain are most accessible.
- Kitchen sinks typically go under a window or on the exterior wall closest to the dishwasher.
- Bathroom sinks face the room entry so they're the first thing you reach.
- Sink orientation follows the same wall-facing logic as toilets.

### Bathtub and Shower

- **Standard tub:** 60" long × 30" wide — fits against a 5ft wall.
- **Minimum shower interior:** 30" × 30".
- Place tubs with the long axis against the longest available wall.
- Shower/tub faucet end should be away from the entry for splash control.

### Wet Wall Strategy

- **Group plumbing fixtures on shared walls** to minimize pipe runs. Back-to-back bathrooms sharing a wet wall is ideal.
- Wet walls need **2×6 framing** (5.5" cavity) to accommodate 3" drain pipes. Specify `stud: "2x6"` for walls carrying major plumbing.
- Stack bathrooms vertically in multi-story plans when possible.

### Fixture vs. Door Conflict Check

After placing plumbing fixtures, verify:
1. No door swing arc overlaps a toilet or vanity
2. At least 21" clearance in front of every fixture
3. Toilet is not the first thing visible when the door is open (aesthetic preference — put vanity in the sightline instead)

---

## Room Sizing

### Minimum and Recommended Sizes

| Room | Code Minimum | Practical Minimum | Comfortable |
|------|-------------|-------------------|-------------|
| Bedroom (single) | 7ft × 10ft | 10ft × 10ft | 10ft × 12ft |
| Master bedroom | 7ft × 10ft | 12ft × 12ft | 14ft × 16ft |
| Living room | 7ft × 10ft | 12ft × 14ft | 14ft × 18ft |
| Kitchen | No minimum | 8ft × 10ft | 10ft × 12ft |
| Full bathroom | No minimum | 5ft × 8ft | 7ft × 9ft |
| Half bath | No minimum | 3ft × 5ft | 4ft × 6ft |
| Hallway width | 3ft minimum | 3ft 6in | 4ft |
| Walk-in closet | N/A | 5ft × 5ft | 6ft × 8ft |
| Reach-in closet | N/A | 2ft × 4ft | 2ft × 6ft |

### Ceiling Heights (for reference in labels/notes)

- Habitable rooms: **7ft minimum** (8ft–9ft standard)
- Bathrooms, laundry: **6ft 8in minimum**

---

## Traffic Flow and Furniture Clearance

### Circulation Widths

- **Primary paths** (hallway, entry to kitchen): 36" minimum, 42"–48" recommended.
- **Between furniture:** 24" minimum squeeze-by, 30"–36" comfortable.
- **Kitchen work aisle:** 42" (one cook), 48" (two cooks).
- **Dining chairs pulled out from table:** 36" from table edge to wall.

### Flow Principles

- No room should be accessible only through another bedroom (bedrooms need independent hallway access).
- The path from bedroom to bathroom should not require passing through public living spaces.
- The kitchen should be accessible from both the dining area and the main entry without crossing through other rooms.
- Front entry should not open directly into a private space (bedroom, bathroom). A foyer, hallway, or living room should buffer.

---

## Wall Construction Defaults

### Thickness Reference

| Wall Type | Framing | Total Thickness | FloorScript default |
|-----------|---------|-----------------|---------------------|
| Interior partition | 2×4 | ~4.5" (~0.375ft) | `stud: "2x4"` |
| Interior load-bearing | 2×6 | ~6.5" (~0.54ft) | `stud: "2x6"`, `type: load-bearing` |
| Exterior | 2×6 | ~6.5"+ | `stud: "2x6"` (default for exterior) |
| Plumbing wet wall | 2×6 | ~6.5" | `stud: "2x6"` |

### When to Override Defaults

- Specify `stud: "2x6"` on interior walls that carry plumbing (wet walls).
- Use `type: load-bearing` for interior walls that run perpendicular to floor joists (typically walls along the center axis of the house).
- Leave wall config as `{ type: interior }` or `{ type: exterior }` in most cases — FloorScript defaults handle standard framing.

---

## Enclosure and Extension Placement

### Avoiding Conflicts

- **Windows must not overlap enclosure/extension boundaries.** If a closet occupies the first 6ft of a north wall, don't place a window in that zone.
- **Doors into enclosures** should be on the enclosure's facing wall, not on a wall shared with the room perimeter.
- **Extension openings** (windows, doors) go on the extension's outward-facing walls, not the wall shared with the parent room (that wall has a gap for access).

### Closet Sizing and Placement

- **Corner closets** (`corner: northwest`, etc.) work well in bedrooms — place them in the corner farthest from the room's main window wall.
- **Walk-in closet depth:** 4ft minimum (allows hanging clothes on one side + walkway). 5ft–6ft allows hanging on both sides.
- **Walk-in closet length:** 6ft minimum for useful hanging space.
- **Reach-in closet depth:** 2ft (standard for single hanging rod). Use `style: bifold` doors for full-width access.
- **Pantry closets** in kitchens: 2ft–3ft deep, 3ft–5ft wide.

### Extension Conventions

- **Bay windows:** 2ft–3ft deep, 4ft–6ft wide. Place windows on all three outward-facing walls (east/north/south for an east-wall extension).
- **Breakfast nook / bump-out:** 3ft–4ft deep, 6ft–8ft wide. Usually on an exterior wall with windows.
- Extension walls are always `type: exterior` unless the extension connects to another room.

---

## Pre-Render Checklist

Before rendering a floor plan, verify these common issues:

1. **Door swings:** All doors swing into the room they serve (except closets). Swing direction pushes the door against the nearest wall, not into traffic.
2. **Window clearances:** No window overlaps an enclosure corner, extension junction, or is closer than 1ft to a room corner.
3. **Opening fits on wall:** `from`/`offset` + `width` does not exceed the wall's total length minus any enclosure/extension that consumes part of that wall.
4. **Outlet spacing:** No wall segment >2ft long is without an outlet. GFCI in wet rooms.
5. **Switch placement:** On the latch side of every room's entry door. Three-way switches for hallways.
6. **Toilet clearance:** 15"+ from side walls, 21"+ in front, not in a door's swing arc.
7. **Fixture orientation:** Toilets and sinks face into the room, away from the wall they're mounted on.
8. **Traffic flow:** Every bedroom has hallway access. Bathroom reachable without crossing another bedroom.
9. **Room sizing:** Every habitable room ≥70 sq ft with ≥7ft minimum dimension.
10. **Enclosure/extension walls:** Sub-space walls typed correctly (interior for enclosures, exterior for extensions facing outside).
