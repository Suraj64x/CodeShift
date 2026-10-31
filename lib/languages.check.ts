// Self-check for graphical-program detection — run with `node lib/languages.check.ts`.
import assert from "node:assert/strict";
import { isGraphical, isPlayable, LANGUAGES } from "./languages.ts";

// Every built-in sample is a console program.
for (const lang of LANGUAGES) {
  assert.equal(isGraphical(lang.id, lang.sample), false, `${lang.id} sample flagged graphical`);
}

assert.equal(isGraphical("python", "import pygame\npygame.init()"), true);
assert.equal(isGraphical("python", "from tkinter import Tk"), true);
assert.equal(isGraphical("python", "import turtle"), true);
assert.equal(isGraphical("python", "# uses pygame later\nprint('hi')"), false);
assert.equal(isGraphical("python", "import pygame_utils_fake"), false);

const canvasGame = "const g = canvas.getContext('2d');\nrequestAnimationFrame(loop);";
assert.equal(isGraphical("javascript", canvasGame), true);
assert.equal(isGraphical("javascript", "console.log('canvas size', 3)"), false);
assert.equal(isPlayable("typescript", canvasGame), true);
assert.equal(isPlayable("python", "import pygame"), false);

assert.equal(isGraphical("java", "import javax.swing.JFrame;"), true);
assert.equal(isGraphical("cpp", "#include <SDL2/SDL.h>"), true);
assert.equal(isGraphical("go", 'import "github.com/hajimehoshi/ebiten/v2"'), true);
assert.equal(isGraphical("rust", "use macroquad::prelude::*;"), true);
assert.equal(isGraphical("ruby", "require 'gosu'"), true);
assert.equal(isGraphical("php", "<?php echo 1;"), false);

console.log("languages: all checks passed");
