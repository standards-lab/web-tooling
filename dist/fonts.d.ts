/** A font set: its name, for test titles and diagnostics, and, for a set the test sets up, the
 * families the page must draw in: its sans for the text, its mono for the code. */
export interface Fonts {
    name: string;
    families?: {
        sans: string;
        mono: string;
    };
}
/** The font set this test process draws in. */
export declare const fonts: () => Fonts;
/**
 * Sets this test process up to draw in DejaVu: writes the test-only fontconfig into a scratch
 * directory, with its cache beside it, and names it in FONTCONFIG_FILE, so a browser launched after
 * this call sees DejaVu's core set alone, every generic family resolving to its DejaVu face, as
 * Ubuntu's own configuration resolves them. Throws when DEJAVU_FONTS is unset; it names the
 * directory of a dejavu-fonts-ttf archive, whose ttf/ holds the faces. Answers the removal of the
 * scratch directory, for after the browser closes.
 */
export declare function useDejaVu(): () => void;
