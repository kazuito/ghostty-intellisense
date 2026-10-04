import { configKeys } from "@/generated/config-keys";

type GhosttyConfigKey = (typeof configKeys)[number]["key"];

export type ConfigEntry = {
  key: string;
  desc: string;
  enum?: Array<string | number | boolean>;
  assets?: Array<"color" | "font">;
  comma?: boolean;
};

type ConfigMetadata = Omit<ConfigEntry, "key" | "desc"> & { desc?: string };

/**
 * Keys that can appear multiple times in a single config file (additive/list semantics).
 * These are never filtered out of completions even when already present in the document.
 */
export const additiveKeys: ReadonlySet<string> = new Set<GhosttyConfigKey>([
  "keybind",
  "command-palette-entry",
  "custom-shader",
  "config-file",
  "gtk-custom-css",
  "input",
  "palette",
  "font-family",
  "font-family-bold",
  "font-family-italic",
  "font-family-bold-italic",
  "font-feature",
  "font-variation",
  "font-variation-bold",
  "font-variation-italic",
  "font-variation-bold-italic",
  "font-codepoint-map",
  "env",
]);

/**
 * Hand-curated per-key metadata the upstream MDX does not expose
 * machine-readably: value enums, color/font asset hints, and comma-separated
 * value semantics. `desc` is an optional override for the generated description.
 * Keyed by config key and merged with the generated key list below.
 */
export const configMetadata: Partial<Record<GhosttyConfigKey, ConfigMetadata>> =
  {
    "font-family": { assets: ["font"] },
    "font-style": { enum: [true, false] },
    "font-style-bold": { enum: [true, false] },
    "font-style-italic": { enum: [true, false] },
    "font-style-bold-italic": { enum: [true, false] },
    "font-synthetic-style": {
      enum: [
        true,
        false,
        "bold",
        "no-bold",
        "italic",
        "no-italic",
        "bold-italic",
        "no-bold-italic",
      ],
      comma: true,
    },
    "font-feature": { comma: true },
    "font-codepoint-map": { comma: true },
    "font-thicken": { enum: [true, false] },
    "font-shaping-break": { enum: ["cursor", "no-cursor"], comma: true },
    "alpha-blending": { enum: ["native", "linear", "linear-corrected"] },
    "grapheme-width-method": { enum: ["unicode", "legacy"] },
    "freetype-load-flags": {
      enum: [
        true,
        false,
        "hinting",
        "no-hinting",
        "force-autohint",
        "no-force-autohint",
        "monochrome",
        "no-monochrome",
        "autohint",
        "no-autohint",
        "light",
        "no-light",
      ],
      comma: true,
    },
    theme: { comma: true },
    background: { assets: ["color"] },
    foreground: { assets: ["color"] },
    "background-image-position": {
      enum: [
        "center",
        "center-right",
        "center-left",
        "top-center",
        "top-right",
        "top-left",
        "bottom-center",
        "bottom-right",
        "bottom-left",
      ],
    },
    "background-image-fit": { enum: ["contain", "cover", "stretch", "none"] },
    "background-image-repeat": { enum: [true, false] },
    "selection-foreground": { assets: ["color"] },
    "selection-background": { assets: ["color"] },
    "selection-clear-on-typing": { enum: [true, false] },
    "selection-clear-on-copy": { enum: [true, false] },
    "palette-generate": { enum: [true, false] },
    "palette-harmonious": { enum: [true, false] },
    "cursor-style": { enum: ["block", "bar", "underline", "block_hollow"] },
    "cursor-style-blink": { enum: [true, false] },
    "cursor-color": { assets: ["color"] },
    "cursor-text": { assets: ["color"] },
    "cursor-click-to-move": { enum: [true, false] },
    "mouse-hide-while-typing": { enum: [true, false] },
    "scroll-to-bottom": {
      enum: [true, false, "keystroke", "no-keystroke", "output", "no-output"],
      comma: true,
    },
    "mouse-shift-capture": { enum: [true, false, "always", "never"] },
    "mouse-reporting": { enum: [true, false] },
    "background-opacity-cells": { enum: [true, false] },
    "unfocused-split-fill": { assets: ["color"] },
    "split-divider-color": { assets: ["color"] },
    "split-preserve-zoom": { enum: [true, false] },
    "search-foreground": { assets: ["color"] },
    "search-background": { assets: ["color"] },
    "search-selected-foreground": { assets: ["color"] },
    "search-selected-background": { assets: ["color"] },
    "notify-on-command-finish": { enum: ["never", "unfocused", "always"] },
    "notify-on-command-finish-action": {
      enum: ["bell", "no-bell", "notify", "no-notify"],
      comma: true,
    },
    "wait-after-command": { enum: [true, false] },
    scrollbar: { enum: ["system", "never"] },
    link: { enum: [true, false] },
    "link-url": { enum: [true, false] },
    "link-previews": { enum: [true, false] },
    maximize: { enum: [true, false] },
    fullscreen: { enum: [true, false] },
    "working-directory": { enum: ["home", "inherit"] },
    "window-padding-x": { comma: true },
    "window-padding-y": { comma: true },
    "window-padding-balance": { enum: [true, false] },
    "window-padding-color": {
      enum: ["background", "extend", "extend-always"],
      assets: ["color"],
    },
    "window-vsync": { enum: [true, false] },
    "window-inherit-working-directory": { enum: [true, false] },
    "tab-inherit-working-directory": { enum: [true, false] },
    "split-inherit-working-directory": { enum: [true, false] },
    "window-inherit-font-size": { enum: [true, false] },
    "window-decoration": {
      enum: ["false", "none", "true", "auto", "client", "server"],
    },
    "window-title-font-family": { assets: ["font"] },
    "window-subtitle": { enum: ["false", "working-directory"] },
    "window-theme": { enum: ["auto", "system", "light", "dark", "ghostty"] },
    "window-colorspace": { enum: ["srgb", "display-p3"] },
    "window-save-state": { enum: ["default", "never", "always"] },
    "window-step-resize": { enum: [true, false] },
    "window-new-tab-position": { enum: ["current", "end"] },
    "window-show-tab-bar": { enum: ["auto", "always", "never"] },
    "window-titlebar-background": { assets: ["color"] },
    "window-titlebar-foreground": { assets: ["color"] },
    "resize-overlay": { enum: ["always", "never", "after-first"] },
    "resize-overlay-position": {
      enum: [
        "center",
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ],
    },
    "focus-follows-mouse": { enum: [true, false] },
    "clipboard-read": { enum: ["ask", "allow", "deny"] },
    "clipboard-write": { enum: ["ask", "allow", "deny"] },
    "clipboard-trim-trailing-spaces": { enum: [true, false] },
    "clipboard-paste-protection": { enum: [true, false] },
    "clipboard-paste-bracketed-safe": { enum: [true, false] },
    "title-report": { enum: [true, false] },
    "copy-on-select": { enum: [true, false, "clipboard"] },
    "right-click-action": {
      enum: ["context-menu", "paste", "copy", "copy-or-paste", "ignore"],
    },
    "config-default-files": { enum: [true, false] },
    "confirm-close-surface": { enum: [true, false, "always"] },
    "quit-after-last-window-closed": { enum: [true, false] },
    "initial-window": { enum: [true, false] },
    "quick-terminal-position": {
      enum: ["top", "bottom", "left", "right", "center"],
    },
    "gtk-quick-terminal-layer": {
      enum: ["overlay", "top", "bottom", "background"],
    },
    "quick-terminal-screen": { enum: ["main", "mouse", "macos-menu-bar"] },
    "quick-terminal-autohide": { enum: [true, false] },
    "quick-terminal-space-behavior": { enum: ["move", "remain"] },
    "quick-terminal-keyboard-interactivity": {
      enum: ["none", "on-demand", "exclusive"],
    },
    "shell-integration": {
      enum: ["none", "detect", "bash", "elvish", "fish", "nushell", "zsh"],
    },
    "shell-integration-features": {
      enum: [
        true,
        false,
        "cursor",
        "no-cursor",
        "sudo",
        "no-sudo",
        "title",
        "no-title",
        "ssh-env",
        "no-ssh-env",
        "ssh-terminfo",
        "no-ssh-terminfo",
        "path",
        "no-path",
      ],
      comma: true,
    },
    "osc-color-report-format": { enum: ["none", "8-bit", "16-bit"] },
    "vt-kam-allowed": { enum: [true, false] },
    "custom-shader-animation": { enum: [true, false, "always"] },
    "bell-features": {
      enum: [
        "system",
        "no-system",
        "audio",
        "no-audio",
        "attention",
        "no-attention",
        "title",
        "no-title",
        "border",
        "no-border",
      ],
      comma: true,
    },
    "app-notifications": {
      enum: [
        true,
        false,
        "clipboard-copy",
        "no-clipboard-copy",
        "config-reload",
        "no-config-reload",
      ],
      comma: true,
    },
    "macos-non-native-fullscreen": { enum: [true, false, "visible-menu"] },
    "macos-window-buttons": { enum: ["visible", "hidden", "macos-native"] },
    "macos-titlebar-style": {
      enum: ["native", "transparent", "tabs", "hidden"],
    },
    "macos-titlebar-proxy-icon": { enum: ["visible", "hidden"] },
    "macos-dock-drop-behavior": { enum: ["new-tab", "new-window"] },
    "macos-option-as-alt": { enum: [true, false, "left", "right"] },
    "macos-window-shadow": { enum: [true, false] },
    "macos-hidden": { enum: ["never", "always"] },
    "macos-auto-secure-input": { enum: [true, false] },
    "macos-secure-input-indication": { enum: [true, false] },
    "macos-applescript": { enum: [true, false] },
    "macos-icon": {
      enum: [
        "official",
        "blueprint",
        "chalkboard",
        "retro",
        "custom",
        "custom-style",
      ],
    },
    "macos-icon-frame": { enum: ["aluminum", "beige", "plastic", "chrome"] },
    "macos-icon-ghost-color": { assets: ["color"] },
    "macos-icon-screen-color": { comma: true, assets: ["color"] },
    "macos-shortcuts": { enum: ["ask", "allow", "deny"] },
    "linux-cgroup": { enum: ["never", "always", "single-instance"] },
    "linux-cgroup-hard-fail": { enum: [true, false] },
    "gtk-opengl-debug": { enum: [true, false] },
    "gtk-single-instance": { enum: [true, false, "detect"] },
    "gtk-titlebar": { enum: [true, false] },
    "gtk-tabs-location": { enum: ["top", "bottom"] },
    "gtk-titlebar-hide-when-maximized": { enum: [true, false] },
    "gtk-toolbar-style": { enum: ["raised", "raised-border", "flat"] },
    "gtk-titlebar-style": { enum: ["native", "tabs"] },
    "gtk-wide-tabs": { enum: [true, false] },
    "desktop-notifications": { enum: [true, false] },
    "progress-style": {
      enum: [
        "floating",
        "no-floating",
        "hidden",
        "no-hidden",
        "dock",
        "no-dock",
      ],
      comma: true,
    },
    "bold-color": { enum: ["bright"], assets: ["color"] },
    "async-backend": { enum: ["auto", "epoll", "io_uring"] },
    "auto-update": { enum: ["off", "check", "download"] },
    "auto-update-channel": { enum: ["stable", "tip"] },
  };

export const ghosttyConfigOptions: ConfigEntry[] = configKeys.map((entry) => ({
  ...entry,
  ...configMetadata[entry.key],
}));

export const optionByKey = new Map(
  ghosttyConfigOptions.map((option) => [option.key, option] as const),
);
