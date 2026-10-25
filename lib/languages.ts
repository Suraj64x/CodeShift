import type { LanguageConfig, LanguageId } from "./types";

// Every sample below is the same program — print `i` and `i*i` for i in 1..5,
// then the sum of the squares — and prints byte-identical stdout:
//
//   1 1
//   2 4
//   3 9
//   4 16
//   5 25
//   sum 55
//
// That makes any pair of samples a known-good conversion for checking that
// verification works end to end.

export const LANGUAGES: LanguageConfig[] = [
  {
    id: "python",
    name: "Python",
    extension: "py",
    fileName: "main.py",
    monacoLanguage: "python",
    runtime: "Python 3.12",
    dockerImage: "python:3.12-alpine",
    executeCommand: "python3 /work/main.py",
    supportsBrowserExecution: true,
    runtimeLibraries:
      "Standard library. In the browser, Pyodide's prebuilt packages also load automatically from imports (numpy, pandas, scipy, sympy, pillow, scikit-learn, matplotlib and pygame-ce without a window, ~300 more); in Docker only the standard library exists, so prefer it unless the program needs more.",
    graphical: /^\s*(?:import|from)\s+(?:pygame|tkinter|turtle|pyglet|arcade|kivy|PyQt[56]|PySide[26]|wx)\b/m,
    aiNotes:
      "print() separates arguments with single spaces and appends a newline. Booleans print as True/False. Use // for integer division. Floats print in repr form (0.1, not 0.10).",
    sample: `total = 0
for i in range(1, 6):
    square = i * i
    total += square
    print(i, square)
print("sum", total)
`,
  },
  {
    id: "javascript",
    name: "JavaScript",
    extension: "js",
    fileName: "main.js",
    monacoLanguage: "javascript",
    runtime: "Node 22",
    dockerImage: "node:22-alpine",
    executeCommand: "node /work/main.js",
    supportsBrowserExecution: true,
    runtimeLibraries:
      "Built-ins only: no npm packages, no import/require of modules. Console programs run on Node 22 (process.stdout.write and process.exit work). Graphical programs run in a browser page with a canvas.",
    graphical: /\b(?:document\.|getContext\s*\(|requestAnimationFrame\s*\()/,
    aiNotes:
      "console.log joins arguments with single spaces. Arrays/objects print in Node's inspect format — prefer explicit string formatting (template literals, join) so stdout is unambiguous. All numbers are floats; use Math.trunc/Math.floor deliberately for integer math.",
    sample: `let total = 0;
for (let i = 1; i <= 5; i++) {
  const square = i * i;
  total += square;
  console.log(i, square);
}
console.log("sum", total);
`,
  },
  {
    id: "typescript",
    name: "TypeScript",
    extension: "ts",
    fileName: "main.ts",
    monacoLanguage: "typescript",
    runtime: "Node 22 (type-stripped)",
    dockerImage: "node:22-alpine",
    executeCommand: "node --no-warnings --experimental-strip-types /work/main.ts",
    supportsBrowserExecution: true,
    runtimeLibraries:
      "Built-ins only: no npm packages, no import/require of modules. Console programs run on Node 22 (process.stdout.write and process.exit work). Graphical programs run in a browser page with a canvas.",
    graphical: /\b(?:document\.|getContext\s*\(|requestAnimationFrame\s*\()/,
    aiNotes:
      "Runs on Node 22 with type stripping: use type annotations freely, but avoid enums, namespaces, and parameter properties (they require transpilation, not stripping). console.log joins arguments with single spaces; prefer explicit string formatting for compound values.",
    sample: `let total: number = 0;
for (let i = 1; i <= 5; i++) {
  const square: number = i * i;
  total += square;
  console.log(i, square);
}
console.log("sum", total);
`,
  },
  {
    id: "java",
    name: "Java",
    extension: "java",
    fileName: "Main.java",
    monacoLanguage: "java",
    runtime: "Java 21 (Temurin)",
    dockerImage: "eclipse-temurin:21-jdk-alpine",
    executeCommand: "java /work/Main.java",
    supportsBrowserExecution: false,
    runtimeLibraries:
      "Java SE standard library only (java.*). No Maven/Gradle dependencies.",
    graphical: /^\s*import\s+(?:javax\.swing|java\.awt|javafx)\./m,
    aiNotes:
      "Single-file source launch: the public class MUST be named Main. System.out.println appends a newline. int is 32-bit and overflows silently; use long for large values. String concatenation with + inserts no spaces.",
    sample: `public class Main {
    public static void main(String[] args) {
        int total = 0;
        for (int i = 1; i <= 5; i++) {
            int square = i * i;
            total += square;
            System.out.println(i + " " + square);
        }
        System.out.println("sum " + total);
    }
}
`,
  },
  {
    id: "cpp",
    name: "C++",
    extension: "cpp",
    fileName: "main.cpp",
    monacoLanguage: "cpp",
    runtime: "GCC 14 (g++, C++17)",
    dockerImage: "gcc:14",
    executeCommand: "g++ -O2 -std=c++17 -o /tmp/a /work/main.cpp && /tmp/a",
    supportsBrowserExecution: false,
    runtimeLibraries:
      "C++ standard library only. No third-party libraries.",
    graphical: /#\s*include\s*[<"](?:SDL2?\/|SDL\.h|raylib\.h|SFML\/|GLFW\/|GL\/)/,
    aiNotes:
      'Compiled with g++ -std=c++17. Use std::cout with explicit "\\n". int is 32-bit; use long long for large values. Floating-point output formatting differs from other languages — set precision explicitly when printing floats.',
    sample: `#include <iostream>

int main() {
    int total = 0;
    for (int i = 1; i <= 5; i++) {
        int square = i * i;
        total += square;
        std::cout << i << " " << square << "\\n";
    }
    std::cout << "sum " << total << "\\n";
    return 0;
}
`,
  },
  {
    id: "c",
    name: "C",
    extension: "c",
    fileName: "main.c",
    monacoLanguage: "c",
    runtime: "GCC 14 (C17)",
    dockerImage: "gcc:14",
    executeCommand: "gcc -O2 -std=c17 -o /tmp/a /work/main.c && /tmp/a",
    supportsBrowserExecution: false,
    runtimeLibraries:
      "C standard library only. No third-party libraries.",
    graphical: /#\s*include\s*[<"](?:SDL2?\/|SDL\.h|raylib\.h|GLFW\/|GL\/)/,
    aiNotes:
      "Compiled with gcc -std=c17. Use printf with explicit format specifiers and \\n. int is 32-bit; use long long (%lld) for large values. No bounds checking — keep buffers safe.",
    sample: `#include <stdio.h>

int main(void) {
    int total = 0;
    for (int i = 1; i <= 5; i++) {
        int square = i * i;
        total += square;
        printf("%d %d\\n", i, square);
    }
    printf("sum %d\\n", total);
    return 0;
}
`,
  },
  {
    id: "go",
    name: "Go",
    extension: "go",
    fileName: "main.go",
    monacoLanguage: "go",
    runtime: "Go 1.23",
    dockerImage: "golang:1.23-alpine",
    executeCommand: "GOCACHE=/tmp/gocache GOPATH=/tmp/gopath go run /work/main.go",
    supportsBrowserExecution: false,
    runtimeLibraries:
      "Go standard library only. No third-party modules.",
    graphical: /"(?:github\.com\/hajimehoshi\/ebiten|fyne\.io\/|gioui\.org|github\.com\/faiface\/pixel)/,
    aiNotes:
      "fmt.Println joins arguments with single spaces and appends a newline. Package must be main with func main(). Unused variables and imports are compile errors — remove them. Integer division truncates.",
    sample: `package main

import "fmt"

func main() {
	total := 0
	for i := 1; i <= 5; i++ {
		square := i * i
		total += square
		fmt.Println(i, square)
	}
	fmt.Println("sum", total)
}
`,
  },
  {
    id: "rust",
    name: "Rust",
    extension: "rs",
    fileName: "main.rs",
    monacoLanguage: "rust",
    runtime: "Rust (rustc, 2021 edition)",
    dockerImage: "rust:1-alpine",
    executeCommand: "rustc -O --edition 2021 -o /tmp/a /work/main.rs && /tmp/a",
    supportsBrowserExecution: false,
    runtimeLibraries:
      "Rust std only. No crates.",
    graphical: /\b(?:use|extern crate)\s+(?:macroquad|bevy|ggez|piston\w*|minifb|winit|eframe|egui)\b/,
    aiNotes:
      "Compiled with rustc (no Cargo, no external crates — std only). println! appends a newline; use {} placeholders. Integer types are explicit; i32 overflow wraps in release builds. The compiler rejects unused Results — handle or ignore with let _ =.",
    sample: `fn main() {
    let mut total = 0;
    for i in 1..=5 {
        let square = i * i;
        total += square;
        println!("{} {}", i, square);
    }
    println!("sum {}", total);
}
`,
  },
  {
    id: "php",
    name: "PHP",
    extension: "php",
    fileName: "main.php",
    monacoLanguage: "php",
    runtime: "PHP 8.3",
    dockerImage: "php:8.3-cli-alpine",
    executeCommand: "php /work/main.php",
    supportsBrowserExecution: false,
    runtimeLibraries:
      "PHP core and bundled extensions only. No Composer packages.",
    aiNotes:
      'Must start with <?php. echo does NOT append a newline — add "\\n" explicitly. true/false echo as 1/(empty) — cast booleans to explicit strings when printing. Integer division uses intdiv().',
    sample: `<?php
$total = 0;
for ($i = 1; $i <= 5; $i++) {
    $square = $i * $i;
    $total += $square;
    echo $i . " " . $square . "\\n";
}
echo "sum " . $total . "\\n";
`,
  },
  {
    id: "ruby",
    name: "Ruby",
    extension: "rb",
    fileName: "main.rb",
    monacoLanguage: "ruby",
    runtime: "Ruby 3.3",
    dockerImage: "ruby:3.3-alpine",
    executeCommand: "ruby /work/main.rb",
    supportsBrowserExecution: false,
    runtimeLibraries:
      "Ruby core and standard library only. No gems.",
    graphical: /^\s*require\s+['"](?:gosu|ruby2d|tk)['"]/m,
    aiNotes:
      "puts appends a newline; print does not. String interpolation is #{}. puts of an array prints each element on its own line — join explicitly instead. Integer division truncates toward negative infinity.",
    sample: `total = 0
(1..5).each do |i|
  square = i * i
  total += square
  puts "#{i} #{square}"
end
puts "sum #{total}"
`,
  },
];

const byId = new Map<LanguageId, LanguageConfig>(LANGUAGES.map((l) => [l.id, l]));

export function getLanguage(id: LanguageId): LanguageConfig {
  const config = byId.get(id);
  if (!config) throw new Error(`Unknown language: ${id}`);
  return config;
}

export function isLanguageId(value: unknown): value is LanguageId {
  return typeof value === "string" && byId.has(value as LanguageId);
}

/** True when `code` uses a GUI/graphics library, so its output is a window, not text. */
export function isGraphical(id: LanguageId, code: string): boolean {
  return getLanguage(id).graphical?.test(code) ?? false;
}

/** Graphical programs in these languages can be played in the browser Play window. */
export function isPlayable(id: LanguageId, code: string): boolean {
  return (id === "javascript" || id === "typescript") && isGraphical(id, code);
}
