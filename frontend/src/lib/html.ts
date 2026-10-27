// Las ventanas de impresion (constancia y listado de materiales) se abren con
// window.open("", "_blank"): ese about:blank HEREDA EL ORIGEN de la app, asi que un
// <script> que entre por el nombre de un cliente o de un material corre con acceso al
// localStorage y se lleva el token de sesion. Y como esos documentos se arman con
// template literals y se inyectan con document.write(), no hay escapado automatico como
// en JSX: todo valor interpolado tiene que pasar por aca antes de entrar al HTML.
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";

  // El & se reemplaza PRIMERO. Si fuera al final volveria a escapar los & de las
  // entidades recien generadas y un "<" terminaria imprimiendose como "&amp;lt;".
  // Se usa &#39; y no &apos; porque estos documentos se escriben sin <!DOCTYPE>
  // (modo quirks) y &apos; no existe en HTML4.
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
