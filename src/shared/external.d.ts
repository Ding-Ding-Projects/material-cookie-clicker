// Ambient declarations for untyped third-party modules. This file is a type
// shim only; the game logic that owns the rest of src/shared/** lives in a
// different lane.
declare module 'electron-squirrel-startup' {
  const handlingSquirrelEvent: boolean;
  export default handlingSquirrelEvent;
}
