/** Sens d'écriture d'un contenu venant du cours (français ou arabe) : arabe dès qu'il contient des lettres arabes. */
export const dirOf = (s: string): "rtl" | "ltr" => (/[؀-ۿ]/.test(s) ? "rtl" : "ltr");
