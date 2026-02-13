# Feature Specification: Composite Rooms — Extensions, Enclosures, and Flexible Positioning

**Feature Branch**: `002-composite-rooms`
**Created**: 2026-02-13
**Status**: Draft
**Input**: User description: "Composite rooms with extensions (outward bump-outs), enclosures (inward carve-outs like closets), and from/offset positioning for non-rectangular room shapes. Phase 1 covers extensions, enclosures, and flexible positioning. Phase 2 covers boundary types between sub-spaces and a general-purpose regions model."

## Clarifications

### Session 2026-02-13

- Q: For corner enclosures, how are `length` and `depth` oriented relative to the two walls meeting at the corner? → A: Keep `length`/`depth` (matches natural voice input like "6 feet long, 2 feet 4 inches deep") and add an optional `facing` field indicating which direction the enclosure opens toward. `depth` is measured in the `facing` direction; `length` runs perpendicular. When `facing` is omitted, it is inferred: (1) from the single wall that has a door opening; (2) if multiple walls have doors, require explicit `facing`; (3) if no doors, default to the shorter enclosure dimension.

## Background

Most real-world rooms are not perfect rectangles. Bedrooms have closets carved into their footprint. Living rooms have window nooks or bay windows that bump out. Kitchens have pantry alcoves. The current FloorScript model only supports rectangular rooms defined by `width` and `height` with four cardinal walls.

This feature adds three capabilities:

1. **Extensions** — sub-spaces that bump outward beyond the parent room's rectangle (window nooks, bay windows, bump-outs)
2. **Enclosures** — sub-spaces carved inward from the parent room's rectangle (closets, pantries, laundry alcoves)
3. **`from`/`offset` positioning** — a human-natural way to place openings, extensions, and enclosures by referencing a named wall and measuring from it

These constructs are designed for LLM generation from voice transcripts. A person measuring a room says "there's a closet in the northwest corner, six feet long, two feet four inches deep" — that maps directly to three lines of YAML without coordinate math or spatial decomposition.

### Taxonomy

| Concept | Direction | Examples | YAML key |
| ------- | --------- | -------- | -------- |
| Extension | Outward beyond parent rectangle | Window nook, bay window, bump-out | `extensions` |
| Enclosure | Inward within parent rectangle | Closet, pantry, laundry alcove | `enclosures` |
| Adjacent room | Separate room sharing a wall | Bathroom next to bedroom | `adjacent_to` (existing) |

### Worked Example: Bedroom with Closet and Window Nook

Source transcript:
> Bedroom number one, south wall, 17 feet 3 inches. East wall, 11 feet 10 inches. North wall, 14 feet 11 inches. Window nook, adjacent to north wall, starting 4 feet 8 inches from the east wall. Nook east wall, 5 feet 4 inches. Nook north wall, 3 feet 9 inches. Window centered on the nook north wall, 3 feet wide. There's a closet on the northwest corner, 6 feet long, 2 feet 4 inches deep. Bedroom door on the west wall, 30 inches wide, 2 feet 7 inches from the south wall.

Target YAML:
```yaml
rooms:
  - id: bedroom1
    label: "Bedroom 1"
    width: 17ft 3in
    height: 11ft 10in
    walls:
      south: { type: exterior }
      east: { type: exterior }
      north: { type: exterior }
      west:
        type: interior
        openings:
          - type: door
            width: 2ft 6in
            from: south
            offset: 2ft 7in
            swing: inward-right

    extensions:
      - id: window-nook
        label: "Window Nook"
        wall: north
        from: east
        offset: 4ft 8in
        width: 3ft 9in
        depth: 5ft 4in
        walls:
          north:
            openings:
              - type: window
                width: 3ft
                position: center

    enclosures:
      - id: closet
        label: "Closet"
        corner: northwest
        facing: east
        length: 6ft
        depth: 2ft 4in
        walls:
          east:
            openings:
              - type: door
                width: 2ft 6in
                position: center
```

Geometry cross-check: The north wall of the bedroom measures 14'11" because the closet occupies 2'4" of depth from the west wall (17'3" - 2'4" = 14'11"). The north wall segments are: 2'4" (closet depth) + 6'6" (wall) + 3'9" (nook opening) + 4'8" (wall) = 17'3", matching the south wall.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Bedroom with Corner Closet (Priority: P1)

A user describes a bedroom via voice transcript. The bedroom's outer rectangle includes a closet carved into one corner. An LLM generates FloorScript YAML using an `enclosures` block with `corner` placement. The system parses the YAML, resolves the room geometry (outer rectangle minus closet area), generates interior walls at the closet boundary, and renders a correct SVG showing the bedroom with the closet as an enclosed sub-space.

**Why this priority**: Closets inside bedrooms are the single most common non-rectangular room case in residential floor plans. Every home has them. This delivers immediate practical value.

**Independent Test**: Can be fully tested by providing YAML with a single room containing one corner enclosure and verifying that the resolved geometry produces correct wall segments, the closet interior walls are generated, and the SVG renders the composite shape.

**Acceptance Scenarios**:

1. **Given** a room YAML with `enclosures: [{corner: northwest, facing: east, length: 6ft, depth: 2ft 4in}]`, **When** the layout is resolved, **Then** the enclosure's depth (2'4") runs E-W (the facing direction) and length (6') runs N-S, the parent room's north wall is shortened by the enclosure depth, the west wall is shortened by the enclosure length, interior walls are generated along the enclosure's exposed edges, and the enclosure has its own resolved room entry with correct bounds.
2. **Given** a room YAML with a corner enclosure that has a door opening on its interior-facing wall, **When** rendered to SVG, **Then** the door appears on the wall separating the closet from the bedroom, with correct swing arc.
3. **Given** a room YAML with `enclosures: [{corner: southeast, length: 8ft, depth: 3ft}]`, **When** the layout is resolved, **Then** the parent room's south wall is shortened by the enclosure depth on the east side, and the east wall is shortened by the enclosure length.

---

### User Story 2 — Room with Extension Bump-out (Priority: P1)

A user describes a room with a window nook or bay window that extends beyond the main rectangle. An LLM generates YAML using an `extensions` block with `wall`, `from`, and `offset` placement. The system resolves the extension as additional area projecting outward from the specified wall, generates exterior walls around the extension, removes the parent wall segment where the extension connects, and renders the composite outline.

**Why this priority**: Window nooks, bay windows, and bump-outs are extremely common in residential architecture. This is co-equal with enclosures for delivering a complete non-rectangular room solution.

**Independent Test**: Can be fully tested by providing YAML with a single room containing one wall extension and verifying that the resolved geometry produces the extension bounds outside the parent rectangle, the parent wall has a gap where the extension connects, and the SVG renders the composite shape.

**Acceptance Scenarios**:

1. **Given** a room YAML with `extensions: [{wall: north, from: east, offset: 4ft 8in, width: 3ft 9in, depth: 5ft 4in}]`, **When** the layout is resolved, **Then** the extension bounds are positioned north of the parent room's north wall, the parent's north wall has a gap matching the extension width at the specified offset, and the extension has three exterior walls (north, east, west).
2. **Given** an extension with a window opening on its outer wall, **When** rendered to SVG, **Then** the window symbol appears on the extension's outer wall with correct dimensions and placement.
3. **Given** an extension placed with `from: west, offset: 0`, **When** resolved, **Then** the extension is flush with the parent room's west edge (no gap between extension and room corner).

---

### User Story 3 — `from`/`offset` Opening Placement (Priority: P1)

A user describes a door or window as "30 inches wide, 2 feet 7 inches from the south wall." An LLM generates YAML using `from: south, offset: 2ft 7in` on the opening. The system resolves this to the correct position along the wall, measuring from the named perpendicular wall to the near edge of the opening.

**Why this priority**: This is how humans naturally describe measurements when walking through a room with a tape measure. Without this, LLMs must convert "2'7" from the south wall" into a numeric offset from the wall start, requiring knowledge of which end is the "start" — a common source of errors.

**Independent Test**: Can be fully tested by providing YAML with openings using `from`/`offset` syntax and verifying the resolved opening positions match the expected coordinates.

**Acceptance Scenarios**:

1. **Given** a door on the west wall with `from: south, offset: 2ft 7in, width: 2ft 6in`, **When** resolved, **Then** the door's near edge is 2'7" from the south wall (bottom of the west wall), and the door extends 2'6" northward from that point.
2. **Given** a window on the north wall with `from: east, offset: 4ft, width: 3ft`, **When** resolved, **Then** the window's near edge is 4' from the east end of the north wall, and the window extends 3' westward.
3. **Given** an opening with `position: center`, **When** resolved, **Then** the opening is centered on the wall's interior length (backward compatible with existing syntax).
4. **Given** an opening using the existing numeric `position` field (no `from`/`offset`), **When** resolved, **Then** it behaves identically to current behavior (full backward compatibility).

---

### User Story 4 — Wall-Positioned Enclosure (Priority: P2)

A user describes a closet that spans the full width of a wall or sits mid-wall rather than in a corner. An LLM generates YAML using an `enclosures` block with `wall` and optional `from`/`offset` placement.

**Why this priority**: While corner closets are most common, full-wall and mid-wall closets (e.g., a reach-in closet centered on the north wall of a hallway) are a frequent secondary pattern.

**Independent Test**: Can be fully tested by providing YAML with a wall-positioned enclosure and verifying correct geometry resolution.

**Acceptance Scenarios**:

1. **Given** an enclosure with `wall: north, length: full, depth: 2ft`, **When** resolved, **Then** the enclosure spans the entire north wall of the parent room, and the parent room's usable depth is reduced by 2'.
2. **Given** an enclosure with `wall: north, from: east, offset: 3ft, length: 6ft, depth: 2ft 4in`, **When** resolved, **Then** the enclosure is positioned along the north wall starting 3' from the east wall, extending 6' westward and 2'4" southward into the room.

---

### User Story 5 — Composite Room Rendering (Priority: P2)

A room with one or more extensions and/or enclosures is rendered to SVG. The composite outline is computed automatically from the union of the parent rectangle and its extensions, minus its enclosures. Room labels, dimension lines, and fill are applied to the composite shape.

**Why this priority**: Correct rendering is essential for the feature to be usable, but depends on the resolution logic from P1 stories being complete first.

**Independent Test**: Can be fully tested end-to-end by providing a multi-room YAML with extensions and enclosures, rendering to SVG, and visually verifying the output.

**Acceptance Scenarios**:

1. **Given** a room with a corner enclosure, **When** rendered to SVG, **Then** the room outline shows the L-shaped composite boundary (not a full rectangle), the enclosure is rendered as a separate labeled area inside, and interior walls appear at the enclosure boundary.
2. **Given** a room with an extension, **When** rendered to SVG, **Then** the room outline includes the extension area, the parent wall has a gap where the extension connects, and the extension's outer walls render as exterior walls.
3. **Given** a room with both extensions and enclosures, **When** rendered to SVG, **Then** the composite outline correctly reflects all modifications, the room label is positioned at a visually appropriate location within the composite shape, and dimension lines trace the composite exterior edges.

---

### User Story 6 — Boundary Types Between Sub-spaces (Priority: P3)

A user describes a transition between a room region and its extension or enclosure using a half-wall, columns, or header beam. An LLM generates YAML using a `boundary` field on the extension or enclosure. The system renders the appropriate boundary treatment at the connection point.

**Why this priority**: This is a Phase 2 enhancement. Most extensions and enclosures have fully open boundaries (default). Boundary types like half-walls and columns are architectural refinements needed for accuracy but not for basic functionality.

**Independent Test**: Can be fully tested by providing YAML with a boundary type specified on an extension or enclosure and verifying the rendered SVG shows the correct boundary treatment.

**Acceptance Scenarios**:

1. **Given** an extension with `boundary: open` (or no boundary specified), **When** rendered, **Then** the connection between parent room and extension has no wall — it is a fully open passage.
2. **Given** an extension with `boundary: {type: half-wall, height: 3ft 6in}`, **When** rendered, **Then** the connection shows a half-wall symbol (dashed line or reduced-weight line) at the junction.
3. **Given** an enclosure with `boundary: {type: columns, count: 2, width: 8in}`, **When** rendered, **Then** the connection shows column symbols at evenly-spaced positions along the boundary edge.

---

### Edge Cases

- What happens when an enclosure's dimensions exceed the parent room's dimensions? (e.g., closet depth > room width) — The system must reject this with a clear validation error.
- What happens when two enclosures in the same room overlap? — The system must reject this with a validation error identifying the overlapping enclosures.
- What happens when an extension is placed at `offset: 0` and `from` the room's edge? — The extension should be flush with the parent room's corner (no gap).
- What happens when an extension's `offset + width` exceeds the parent wall's length? — The system must reject this with a validation error.
- What happens when an opening is placed on a wall segment that has been removed by an extension connection? — The system must reject this or reassign the opening to the extension's wall.
- What happens when another room uses `adjacent_to` referencing a wall partially consumed by an extension or enclosure? — The adjacent room should attach to the remaining wall segment; if the wall is fully consumed, the system should emit a validation warning suggesting the user specify a region or reposition.
- How does `from`/`offset` interact with walls shortened by enclosures? — The `from`/`offset` measurement is relative to the original parent room's wall endpoints (before enclosure carve-out), since that matches how a human measures the physical space. For example, a room with a northwest corner enclosure (depth 2'4") and an opening on the north wall with `from: west, offset: 1ft` — the offset measures from the original west corner of the room, which means the opening falls within the enclosure's footprint and MUST be rejected with a validation error (the wall segment at that position has been replaced by the enclosure boundary).
- What happens when a room has no extensions or enclosures? — It behaves identically to current rectangular rooms (full backward compatibility).

## Requirements *(mandatory)*

### Functional Requirements

**Enclosures (inward carve-outs)**

- **FR-001**: The system MUST support an `enclosures` array on any room definition, where each enclosure defines a rectangular sub-space carved from the parent room's interior.
- **FR-002**: Each enclosure MUST support corner-based placement via a `corner` field accepting one of: `northwest`, `northeast`, `southwest`, `southeast`.
- **FR-003**: Each enclosure MUST support wall-based placement via a `wall` field (cardinal direction) with optional `from`/`offset` positioning along that wall.
- **FR-004**: Each corner enclosure MUST specify `length` (perpendicular to the facing direction) and `depth` (in the facing direction, i.e., how far the enclosure extends from the corner wall into the room). An optional `facing` field indicates which cardinal direction the enclosure opens toward (e.g., `facing: east` means depth is measured E-W and length runs N-S). When `facing` is omitted, it is inferred using a three-tier rule: (1) if exactly one of the enclosure's walls has door openings, face that wall's direction; (2) if multiple walls have door openings, the system MUST reject the configuration with an error requiring an explicit `facing` field; (3) if no doors are present, the system defaults to facing the room interior along the shorter enclosure dimension.
- **FR-005**: Each wall enclosure MUST specify `length` (along the wall) and `depth` (perpendicular into the room). The `length` field MUST accept either a dimension value (e.g., `6ft`) or the keyword `"full"` to span the entire wall. `"full"` is a distinct string keyword, not a dimension — the system MUST resolve it to the parent wall's interior length at geometry resolution time.
- **FR-006**: The system MUST generate interior walls along the enclosure's exposed edges (the edges facing the parent room's remaining space).
- **FR-007**: The system MUST shorten the parent room's affected exterior wall(s) to reflect the enclosure's footprint (e.g., a northwest corner enclosure shortens both the north and west walls of the parent room by the enclosure's depth and length respectively).
- **FR-008**: Each enclosure MUST support its own `walls` configuration for specifying openings (doors) on its interior-facing walls.
- **FR-009**: Each enclosure MUST have a unique `id` and a `label` for rendering.

**Extensions (outward bump-outs)**

- **FR-010**: The system MUST support an `extensions` array on any room definition, where each extension defines a rectangular sub-space projecting outward beyond the parent room's rectangle.
- **FR-011**: Each extension MUST specify `wall` (the parent wall it extends from), `width` (parallel to the parent wall), and `depth` (perpendicular, extending outward).
- **FR-012**: Each extension MUST support `from`/`offset` positioning to place it along the parent wall, where `from` names a perpendicular wall and `offset` measures from that wall to the extension's near edge.
- **FR-013**: The system MUST remove the parent wall segment where the extension connects, creating an open passage between the parent room and the extension.
- **FR-014**: The system MUST generate exterior walls around the extension's three exposed sides (the side facing the parent room is open by default).
- **FR-015**: Each extension MUST support its own `walls` configuration for specifying openings (windows, doors) on its exterior walls.
- **FR-016**: Each extension MUST have a unique `id` and a `label` for rendering.

**`from`/`offset` Positioning**

- **FR-017**: The system MUST support `from`/`offset` as an alternative to the existing numeric `position` field for placing openings on walls.
- **FR-018**: The `from` field MUST accept a cardinal direction naming the perpendicular wall to measure from (e.g., `from: south` on a west wall means "measure from the south end").
- **FR-019**: The `offset` field MUST accept a dimension value representing the distance from the named wall to the near edge of the element being placed.
- **FR-020**: The system MUST support `position: center` as a shorthand for centering an element on a wall. `"center"` is a distinct string keyword, not a dimension value — the system MUST accept it as a special case in the position field and resolve it to `(wallInteriorLength - elementWidth) / 2` at geometry resolution time.
- **FR-021**: The existing numeric `position` field MUST continue to work unchanged for full backward compatibility.
- **FR-022**: The `from`/`offset` syntax MUST also work for placing extensions and enclosures along walls (not just openings).

**Composite Geometry**

- **FR-023**: The system MUST auto-compute the composite room outline from the union of the parent rectangle plus extensions, minus enclosures. This outline MUST NOT require manual specification.
- **FR-024**: The system MUST position the room label at the centroid of the largest rectangular sub-area of the composite shape. The label MUST be fully contained within the composite outline (not overlapping any wall or extending outside the boundary).
- **FR-025**: The system MUST generate dimension lines that trace the composite exterior edges rather than the simple parent rectangle.
- **FR-026**: The system MUST integrate extensions and enclosures into the shared wall detection system so that adjacent rooms can share walls with extensions or enclosures.

**Validation**

- **FR-027**: The system MUST reject enclosures whose dimensions exceed the parent room's dimensions with a clear, actionable error message that identifies the enclosure by `id`, states the invalid dimension and the parent room's limit, and suggests a corrected value.
- **FR-028**: The system MUST reject overlapping enclosures within the same room with an actionable error identifying both enclosures by `id` and the overlapping region.
- **FR-029**: The system MUST reject extensions whose placement exceeds the parent wall's length (`from offset + extension width > wall length`) with an actionable error identifying the extension by `id`, the computed total, and the wall's actual length.
- **FR-030**: The system MUST reject openings placed on wall segments that no longer exist due to extension connections, with an actionable error identifying the opening, the wall, and the extension that removed the segment.
- **FR-030a**: The system MUST reject enclosures and extensions with duplicate `id` values within the same room, with an error identifying the duplicate `id`.

**Backward Compatibility**

- **FR-031**: Rooms with no `extensions` or `enclosures` keys MUST behave identically to current rectangular rooms with zero changes to output.
- **FR-032**: The existing `position` field for openings MUST remain functional alongside the new `from`/`offset` syntax.

**Phase 2 — Boundary Types**

- **FR-033**: Extensions and enclosures MUST support an optional `boundary` field that defaults to `open` (no wall at the connection).
- **FR-034**: The `boundary` field MUST support `type: half-wall` with a `height` dimension for pony walls.
- **FR-035**: The `boundary` field MUST support `type: columns` with `count` and `width` for column-separated transitions.
- **FR-036**: The `boundary` field MUST support `type: header` with a `height` dimension for header beams above open passages.

### Key Entities

- **Extension**: A rectangular sub-space that projects outward from a parent room's wall. Defined by parent wall, position along that wall, width, and depth. Becomes part of the parent room's composite outline. Has its own walls and openings.
- **Enclosure**: A rectangular sub-space carved from within a parent room's footprint. Defined by corner or wall placement, length, depth, and optional facing direction. `facing` determines orientation: `depth` is measured in the facing direction, `length` runs perpendicular. When omitted, `facing` is inferred via three-tier rule: (1) single wall with doors → face that direction; (2) multiple walls with doors → reject, require explicit `facing`; (3) no doors → face the shorter dimension. Creates interior walls at its boundary with the parent room. Has its own walls, openings, and label.
- **Composite Outline**: The auto-computed rectilinear polygon representing the union of a room's parent rectangle and extensions, minus enclosures. Used for rendering room fill, label placement, and dimension lines.
- **`from`/`offset` Position**: A positioning method that names a reference wall (`from`) and a distance (`offset`) measured from that wall to the near edge of the placed element. Applies to openings, extensions, and enclosures.
- **Boundary**: An optional transition treatment at the connection point between a parent room and its extension or enclosure. Defaults to `open`. Phase 2 adds half-wall, columns, and header types.

## Assumptions

- **Parent room dimensions are the outer bounding rectangle**: When a room has enclosures, its `width` and `height` represent the full outer dimensions including the area occupied by enclosures. This matches how humans measure rooms (outer wall to outer wall).
- **Enclosures create interior walls by default**: The walls between an enclosure and the parent room's remaining space are interior walls with default interior thickness unless otherwise specified.
- **Extensions create exterior walls by default**: The three exposed walls of an extension are exterior walls with default exterior thickness unless otherwise specified.
- **LLM generation is the primary authoring path**: The YAML syntax is optimized for LLM output from voice transcripts rather than hand-authoring. Design decisions favor directness of mapping from natural language over conciseness or DRY principles.
- **All sub-spaces are axis-aligned rectangles**: Extensions and enclosures are rectangular with edges parallel to the parent room's walls. Diagonal or curved sub-spaces are out of scope.
- **`from`/`offset` measures to the near edge**: The offset distance is from the named reference wall to the closest edge of the element, not its center. This matches tape-measure behavior.
- **Phase 2 boundary types are additive**: Boundary types do not change any Phase 1 behavior — they add optional visual treatments to connections that default to fully open.

## Scope Boundaries

**In scope (Phase 1)**:
- Corner-placed enclosures
- Wall-placed enclosures (with `from`/`offset` or `full`)
- Wall extensions with `from`/`offset` positioning
- `from`/`offset` positioning for openings on all walls
- Auto-computed composite room outlines
- SVG rendering of composite rooms
- Integration with shared wall detection
- Validation of invalid configurations
- Backward compatibility with existing rectangular rooms

**In scope (Phase 2)**:
- Boundary types (half-wall, columns, header) at sub-space connections
- General-purpose `regions` model for shapes that cannot be expressed as rectangle + modifications

**Out of scope**:
- Diagonal or angled walls
- Curved walls or rooms
- True polygon rooms defined by vertex lists
- Nested enclosures (enclosure within an enclosure)
- Extensions on extensions

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An LLM can generate valid YAML for a bedroom with a corner closet from a voice transcript in a single attempt, with no manual coordinate math required — verified by providing 5 diverse bedroom transcript samples and confirming all produce valid, geometrically correct output.
- **SC-002**: An LLM can generate valid YAML for a room with a window nook extension from a voice transcript, with the extension correctly positioned using `from`/`offset` — verified by providing 5 diverse nook/bay-window transcript samples.
- **SC-003**: All existing test suites pass without modification, confirming full backward compatibility for rooms without extensions or enclosures.
- **SC-004**: The composite room outline is auto-computed correctly for rooms with up to 4 extensions and/or enclosures — verified by geometry assertions in unit tests comparing computed outlines against expected vertex lists.
- **SC-005**: SVG rendering of composite rooms produces visually correct output with no clipped elements, overlapping labels, or missing walls — verified by visual inspection of at least 3 representative examples covering corner enclosures, wall enclosures, and extensions.
- **SC-006**: The SKILL.md update for LLM floor plan generation adds no more than 30 lines of instruction to cover extensions, enclosures, and `from`/`offset` positioning.
