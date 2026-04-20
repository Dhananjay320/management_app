// ============================================================================
// Whiteboard.js — infinite-canvas whiteboard with sticky notes, shapes, text, and drawings.
// ============================================================================
// Session 31 (N2) part 1. A whiteboard holds a list of elements positioned
// on a 2D canvas. Elements come in four flavors:
//
//   sticky  — movable note with text + color
//   shape   — rectangle, ellipse, or triangle with fill + stroke
//   text    — free-floating text block
//   draw    — freehand polyline (from pen tool)
//
// All elements share common fields (x, y, w, h, z) and have type-specific
// fields under `data`. We store them as subdocs on the whiteboard rather
// than separate collections because the write pattern is "update this one
// whiteboard" — one save can persist many element changes atomically.
//
// Multi-user collaboration (Session 32 part 2) will add real-time diff
// events over sockets; the model stays the same.
// ============================================================================

const mongoose = require('mongoose');

const ELEMENT_TYPES = ['sticky', 'shape', 'text', 'draw'];

// One element on the canvas. `data` is schemaless because each type has
// different needs (sticky has text + color; draw has points array).
const elementSchema = new mongoose.Schema({
  id:    { type: String, required: true },    // client-generated uuid
  type:  { type: String, enum: ELEMENT_TYPES, required: true },

  // Position + size in world coordinates (not screen). Pan/zoom transforms
  // these to screen space at render time.
  x:     { type: Number, default: 0 },
  y:     { type: Number, default: 0 },
  w:     { type: Number, default: 180 },
  h:     { type: Number, default: 120 },

  // Stacking order within the board. Higher = on top.
  z:     { type: Number, default: 0 },

  // Rotation in degrees (0 default; used by shape + text later).
  rot:   { type: Number, default: 0 },

  // Type-specific payload. Kept Object so we don't cage future element types.
  data:  { type: Object, default: {} },

  // Who created the element (useful for multi-user attribution later).
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const whiteboardSchema = new mongoose.Schema({
  title:    { type: String, required: true, trim: true, maxlength: 200 },
  owner:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },  // optional scope

  // Sharing — mirrors the Workspace pattern. Members can view + edit.
  members:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // The elements on the canvas. Array order is secondary to `z`;
  // renderers sort by `z` then array order for stable tiebreaks.
  elements: { type: [elementSchema], default: [] },

  // Camera state — last known pan/zoom. Saved per-whiteboard, shared
  // across sessions, so reopening resumes where you left off. In
  // Session 32 we'll make this per-user.
  viewport: {
    x:    { type: Number, default: 0 },
    y:    { type: Number, default: 0 },
    zoom: { type: Number, default: 1 },
  },

  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

whiteboardSchema.index({ owner: 1, isActive: 1 });
whiteboardSchema.index({ members: 1, isActive: 1 });
whiteboardSchema.index({ workspace: 1, isActive: 1 });

module.exports = mongoose.model('Whiteboard', whiteboardSchema);
module.exports.ELEMENT_TYPES = ELEMENT_TYPES;
