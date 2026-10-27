import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml } from "./html.ts";

test("escapeHtml neutraliza el vector de robo de token", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="fetch(1)">'),
    "&lt;img src=x onerror=&quot;fetch(1)&quot;&gt;"
  );
});

test("escapeHtml no re-escapa las entidades que genera", () => {
  assert.equal(escapeHtml("Roble & Pino <2mm>"), "Roble &amp; Pino &lt;2mm&gt;");
});

test("escapeHtml devuelve cadena vacia para null y undefined", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("escapeHtml convierte numeros a texto sin tocarlos", () => {
  assert.equal(escapeHtml(12), "12");
  assert.equal(escapeHtml(0), "0");
});

test("escapeHtml cubre comillas simples y dobles", () => {
  assert.equal(escapeHtml("a'b\"c"), "a&#39;b&quot;c");
});
