#!/usr/bin/env tsx
// Rewrite an upstream PR into a leak-resistant task variant.
//
// For MVP this is a stub that documents the intended pipeline. A real
// implementation would:
//   1. Clone upstream at base SHA.
//   2. Walk AST (per language) and rename public symbols / files via a
//      stable mapping stored in gold/<id>/rewrite.map.
//   3. Produce gold/<id>/pre_patch.diff (bug restoration) and
//      gold/<id>/expected.diff (reference fix, remapped).
//   4. Regenerate hidden tests using the mapping.
//
// Keeping it as a stub avoids shipping half-working code and makes the
// intended contract explicit.
console.log(
  "stub: implement AST-based rename pipeline per language. See docs/ANTI_LEAK.md.",
);
