figma.showUI(__html__, {
  width: 530,
  height: 760,
  themeColors: true,
});

const DEFAULT_FONT = { family: "Inter", style: "Regular" };
const ENABLE_AUTO_LAYOUT = true;
let availableFontsPromise = null;
const iconSvgCache = new Map();
const IMPORT_ASSET_PREFIX = "EazyUI";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseFloat(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePx(value, fallback = 0) {
  return toNumber(value, fallback);
}

function parseBoxInsets(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => parsePx(part, 0));
  if (parts.length === 1) {
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  }
  if (parts.length === 2) {
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  }
  if (parts.length === 3) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  }
  if (parts.length >= 4) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function parseRgbComponent(value) {
  const raw = String(value || "").trim();
  if (raw.endsWith("%")) {
    return clamp(parseFloat(raw) / 100, 0, 1);
  }
  return clamp(parseFloat(raw) / 255, 0, 1);
}

function parseAlphaComponent(value) {
  const raw = String(value || "").trim();
  if (!raw) return 1;
  if (raw.endsWith("%")) {
    return clamp(parseFloat(raw) / 100, 0, 1);
  }
  return clamp(parseFloat(raw), 0, 1);
}

function cssColorStringFromPaint(paint) {
  if (!paint || !paint.color) return "#111827";
  const r = Math.round(clamp(paint.color.r, 0, 1) * 255);
  const g = Math.round(clamp(paint.color.g, 0, 1) * 255);
  const b = Math.round(clamp(paint.color.b, 0, 1) * 255);
  const a = paint.opacity !== undefined ? clamp(paint.opacity, 0, 1) : 1;
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

function svgColorHexFromPaint(paint) {
  if (!paint || !paint.color) return "#111827";
  const r = Math.round(clamp(paint.color.r, 0, 1) * 255).toString(16).padStart(2, "0");
  const g = Math.round(clamp(paint.color.g, 0, 1) * 255).toString(16).padStart(2, "0");
  const b = Math.round(clamp(paint.color.b, 0, 1) * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function solidPaint(color, opacity = 1) {
  return {
    type: "SOLID",
    color,
    opacity: clamp(opacity, 0, 1),
  };
}

function parseColor(input) {
  const raw = String(input || "").trim();
  if (!raw || raw === "transparent" || raw === "rgba(0, 0, 0, 0)") {
    return null;
  }

  const hex = raw.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const value = hex[1];
    if (value.length === 3) {
      return solidPaint({
        r: parseInt(value[0] + value[0], 16) / 255,
        g: parseInt(value[1] + value[1], 16) / 255,
        b: parseInt(value[2] + value[2], 16) / 255,
      });
    }
    if (value.length === 6 || value.length === 8) {
      const opacity = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
      return solidPaint({
        r: parseInt(value.slice(0, 2), 16) / 255,
        g: parseInt(value.slice(2, 4), 16) / 255,
        b: parseInt(value.slice(4, 6), 16) / 255,
      }, opacity);
    }
  }

  const rgb = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const inner = rgb[1].trim();
    const slashParts = inner.split("/").map((part) => part.trim());
    const colorPart = slashParts[0];
    const alphaPart = slashParts[1];
    const parts = colorPart.includes(",")
      ? colorPart.split(",").map((part) => part.trim())
      : colorPart.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) {
      return solidPaint({
        r: parseRgbComponent(parts[0]),
        g: parseRgbComponent(parts[1]),
        b: parseRgbComponent(parts[2]),
      }, alphaPart !== undefined
        ? parseAlphaComponent(alphaPart)
        : parts[3] !== undefined
          ? parseAlphaComponent(parts[3])
          : 1);
    }
  }

  const srgb = raw.match(/^color\(srgb\s+([^\)]+)\)$/i);
  if (srgb) {
    const inner = srgb[1].trim();
    const slashParts = inner.split("/").map((part) => part.trim());
    const colorPart = slashParts[0];
    const alphaPart = slashParts[1];
    const parts = colorPart.split(/\s+/).filter(Boolean);
    if (parts.length >= 3) {
      return solidPaint({
        r: clamp(parseFloat(parts[0]), 0, 1),
        g: clamp(parseFloat(parts[1]), 0, 1),
        b: clamp(parseFloat(parts[2]), 0, 1),
      }, alphaPart !== undefined ? parseAlphaComponent(alphaPart) : 1);
    }
  }

  return null;
}

function parsePercentOrPx(value, size, fallbackRatio = 0.5) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallbackRatio;
  if (raw === "left" || raw === "top") return 0;
  if (raw === "center") return 0.5;
  if (raw === "right" || raw === "bottom") return 1;
  if (raw.endsWith("%")) {
    return clamp(parseFloat(raw) / 100, 0, 1);
  }
  if (size <= 0) return fallbackRatio;
  return clamp(parsePx(raw, size * fallbackRatio) / size, 0, 1);
}

function normalizeGradientPosition(value, width, height) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  const x = parsePercentOrPx(parts[0], width, 0.5);
  const y = parsePercentOrPx(parts[1] || parts[0], height, 0.5);
  return { x, y };
}

function parseGradientColorStop(token, fallbackPosition) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  const colorMatches = raw.match(/(rgba?\([^)]+\)|#[0-9a-f]{3,8}|color\(srgb\s+[^\)]+\))/ig) || [];
  const colorToken = colorMatches[0];
  if (!colorToken) return null;

  const color = parseColor(colorToken);
  if (!color) return null;

  const remainder = raw.slice(raw.indexOf(colorToken) + colorToken.length).trim();
  const positionToken = remainder.split(/\s+/).find(Boolean);
  let position = fallbackPosition;
  if (positionToken) {
    if (positionToken.endsWith("%")) {
      position = clamp(parseFloat(positionToken) / 100, 0, 1);
    } else {
      position = clamp(parseFloat(positionToken), 0, 1);
    }
  }

  return {
    color: {
      r: color.color.r,
      g: color.color.g,
      b: color.color.b,
      a: color.opacity !== undefined ? color.opacity : 1,
    },
    position,
  };
}

function inferLinearGradientAngle(token) {
  const raw = String(token || "").trim().toLowerCase();
  if (!raw) return 180;
  if (raw.endsWith("deg")) return parseFloat(raw);
  if (raw.startsWith("to ")) {
    const parts = raw.replace(/^to\s+/, "").split(/\s+/);
    const hasTop = parts.includes("top");
    const hasBottom = parts.includes("bottom");
    const hasLeft = parts.includes("left");
    const hasRight = parts.includes("right");
    if (hasTop && hasLeft) return 315;
    if (hasTop && hasRight) return 45;
    if (hasBottom && hasLeft) return 225;
    if (hasBottom && hasRight) return 135;
    if (hasTop) return 0;
    if (hasRight) return 90;
    if (hasBottom) return 180;
    if (hasLeft) return 270;
  }
  return 180;
}

function linearGradientHandles(angleDeg) {
  const radians = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const tx = Math.abs(dx) > 0.0001 ? 0.5 / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(dy) > 0.0001 ? 0.5 / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);
  const start = { x: 0.5 - dx * t, y: 0.5 - dy * t };
  const end = { x: 0.5 + dx * t, y: 0.5 + dy * t };
  const perp = { x: -dy, y: dx };
  const widthHandle = { x: start.x + perp.x * 0.5, y: start.y + perp.y * 0.5 };
  return [start, end, widthHandle];
}

function buildGradientStops(tokens) {
  const colorTokens = tokens.filter((token) => /(rgba?\(|#|color\(srgb)/i.test(token));
  return colorTokens
    .map((token, index) => {
      const fallbackPosition = colorTokens.length <= 1 ? 0 : index / (colorTokens.length - 1);
      return parseGradientColorStop(token, fallbackPosition);
    })
    .filter(Boolean);
}

function parseLinearGradientPaint(input) {
  const raw = String(input || "").trim();
  const match = raw.match(/^linear-gradient\((.*)\)$/i);
  if (!match) return null;

  const tokens = splitCssList(match[1]);
  if (!tokens.length) return null;

  const first = tokens[0].trim();
  const hasDirection = /^to\s+|^-?\d+(\.\d+)?deg$/i.test(first);
  const angle = inferLinearGradientAngle(hasDirection ? first : "180deg");
  const stops = buildGradientStops(hasDirection ? tokens.slice(1) : tokens);
  if (stops.length < 2) return null;

  return {
    type: "GRADIENT_LINEAR",
    gradientStops: stops,
    gradientHandlePositions: linearGradientHandles(angle),
  };
}

function parseRadialGradientPaint(input, width = 1, height = 1) {
  const raw = String(input || "").trim();
  const match = raw.match(/^radial-gradient\((.*)\)$/i);
  if (!match) return null;

  const tokens = splitCssList(match[1]);
  if (!tokens.length) return null;

  let center = { x: 0.5, y: 0.5 };
  const first = tokens[0].trim();
  const atMatch = first.match(/\bat\s+(.+)$/i);
  let stopTokens = tokens;
  if (atMatch) {
    center = normalizeGradientPosition(atMatch[1], width, height);
    stopTokens = tokens.slice(1);
  }

  const stops = buildGradientStops(stopTokens);
  if (stops.length < 2) return null;

  return {
    type: "GRADIENT_RADIAL",
    gradientStops: stops,
    gradientHandlePositions: [
      center,
      { x: clamp(center.x + 0.5, 0, 1), y: center.y },
      { x: center.x, y: clamp(center.y + 0.5, 0, 1) },
    ],
  };
}

function escapeXml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgToDataUrl(markup) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(markup || "").trim())}`;
}

function splitBackgroundValueLayers(value) {
  const parts = splitCssList(value);
  return parts.length > 0 ? parts : [];
}

function getBackgroundLayerValue(value, index) {
  const layers = splitBackgroundValueLayers(value);
  if (layers.length === 0) return "";
  return layers[index] || layers[layers.length - 1] || "";
}

function extractCssUrl(input) {
  const match = String(input || "").trim().match(/^url\(\s*(['"]?)(.*?)\1\s*\)$/i);
  return match ? match[2].trim() : "";
}

function interpolateChannel(from, to, t) {
  return from + (to - from) * t;
}

function interpolateGradientColor(from, to, t) {
  return {
    r: interpolateChannel(from.r, to.r, t),
    g: interpolateChannel(from.g, to.g, t),
    b: interpolateChannel(from.b, to.b, t),
    a: interpolateChannel(from.a, to.a, t),
  };
}

function rgbaCssFromColorStop(stop) {
  const r = Math.round(clamp(stop.r, 0, 1) * 255);
  const g = Math.round(clamp(stop.g, 0, 1) * 255);
  const b = Math.round(clamp(stop.b, 0, 1) * 255);
  return `rgba(${r}, ${g}, ${b}, ${clamp(stop.a, 0, 1)})`;
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function buildConicGradientSvgMarkup(input, width = 1, height = 1) {
  const raw = String(input || "").trim();
  const match = raw.match(/^conic-gradient\((.*)\)$/i);
  if (!match) return null;

  const tokens = splitCssList(match[1]);
  if (!tokens.length) return null;

  let currentIndex = 0;
  let angleOffset = 0;
  let center = { x: 0.5, y: 0.5 };
  const first = tokens[0].trim();
  if (/^from\s+/i.test(first) || /\bat\s+/i.test(first)) {
    const fromMatch = first.match(/from\s+(-?\d+(\.\d+)?)deg/i);
    if (fromMatch) angleOffset = parseFloat(fromMatch[1]);
    const atMatch = first.match(/\bat\s+(.+)$/i);
    if (atMatch) {
      center = normalizeGradientPosition(atMatch[1], width, height);
    }
    currentIndex = 1;
  }

  const stops = buildGradientStops(tokens.slice(currentIndex));
  if (stops.length < 2) return null;

  const normalizedStops = stops
    .map((stop, index) => ({
      color: stop.color,
      position: index === stops.length - 1
        ? 1
        : clamp(stop.position, 0, 1),
    }))
    .sort((left, right) => left.position - right.position);

  const cx = center.x * width;
  const cy = center.y * height;
  const radius = Math.max(width, height);
  const slices = [];

  for (let index = 0; index < normalizedStops.length; index += 1) {
    const current = normalizedStops[index];
    const next = normalizedStops[index + 1] || {
      color: normalizedStops[0].color,
      position: normalizedStops[0].position + 1,
    };
    const start = current.position;
    const end = Math.max(start, next.position);
    const span = end - start;
    const steps = Math.max(1, Math.min(24, Math.ceil(span * 32)));
    for (let step = 0; step < steps; step += 1) {
      const t0 = step / steps;
      const t1 = (step + 1) / steps;
      const angle0 = angleOffset + (start + span * t0) * 360;
      const angle1 = angleOffset + (start + span * t1) * 360;
      const color = interpolateGradientColor(current.color, next.color, (t0 + t1) / 2);
      const startPoint = polarToCartesian(cx, cy, radius, angle0);
      const endPoint = polarToCartesian(cx, cy, radius, angle1);
      const largeArc = Math.abs(angle1 - angle0) > 180 ? 1 : 0;
      slices.push(
        `<path d="M ${cx} ${cy} L ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y} Z" fill="${escapeXml(rgbaCssFromColorStop(color))}" />`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${slices.join("")}</svg>`;
}

async function createImagePaintFromSource(src, options = {}) {
  const value = String(src || "").trim();
  if (!value) return null;

  let figmaImage;
  const base64Bytes = decodeBase64ImageBytes(value);
  if (base64Bytes) {
    figmaImage = figma.createImage(base64Bytes);
  } else {
    figmaImage = await figma.createImageAsync(value);
  }

  const sizeValue = String(options.size || "").toLowerCase();
  const repeatValue = String(options.repeat || "").toLowerCase();
  const position = parseObjectPosition(options.position);
  let scaleMode = "FILL";
  if (sizeValue.includes("contain") || sizeValue.includes("scale-down")) {
    scaleMode = "FIT";
  } else if (sizeValue.includes("auto") || repeatValue.includes("repeat")) {
    scaleMode = "CROP";
  } else if (sizeValue.includes("cover")) {
    scaleMode = "FILL";
  }

  const paint = {
    type: "IMAGE",
    imageHash: figmaImage.hash,
    scaleMode,
  };

  if (scaleMode === "CROP") {
    paint.imageTransform = [
      [1, 0, clamp(position.x - 0.5, -1, 1)],
      [0, 1, clamp(position.y - 0.5, -1, 1)],
    ];
  }

  return paint;
}

async function buildPaintForBackgroundLayer(layer, width, height, options = {}) {
  const trimmed = String(layer || "").trim();
  if (!trimmed) return null;

  const gradientPaint = parseLinearGradientPaint(trimmed) || parseRadialGradientPaint(trimmed, width, height);
  if (gradientPaint) return gradientPaint;

  const conicMarkup = buildConicGradientSvgMarkup(trimmed, width, height);
  if (conicMarkup) {
    return createImagePaintFromSource(svgToDataUrl(conicMarkup), options);
  }

  const url = extractCssUrl(trimmed);
  if (url) {
    return createImagePaintFromSource(url, options);
  }

  return null;
}

async function parseBackgroundImageFills(value, width, height, options = {}) {
  const layers = splitCssList(value);
  const fills = [];
  for (let index = 0; index < layers.length; index += 1) {
    const paint = await buildPaintForBackgroundLayer(layers[index], width, height, {
      size: getBackgroundLayerValue(options.backgroundSize, index),
      position: getBackgroundLayerValue(options.backgroundPosition, index),
      repeat: getBackgroundLayerValue(options.backgroundRepeat, index),
    });
    if (paint) fills.push(paint);
  }
  return fills;
}

async function buildFillPaints(nodeDef) {
  const visual = nodeDef && nodeDef.visual ? nodeDef.visual : {};
  const bounds = getBounds(nodeDef);
  const fills = [];
  const solid = parseColor(visual.backgroundColor);
  if (solid) fills.push(solid);
  if (visual.backgroundImage) {
    const backgroundFills = await parseBackgroundImageFills(visual.backgroundImage, bounds.width, bounds.height, {
      backgroundSize: visual.backgroundSize,
      backgroundPosition: visual.backgroundPosition,
      backgroundRepeat: visual.backgroundRepeat,
    });
    for (let index = 0; index < backgroundFills.length; index += 1) {
      fills.push(backgroundFills[index]);
    }
  }
  return fills;
}

function parseLineHeight(value, fontSize) {
  const raw = String(value || "").trim();
  if (!raw || raw === "normal") {
    return { unit: "AUTO" };
  }
  if (raw.endsWith("%")) {
    return {
      unit: "PERCENT",
      value: clamp(parseFloat(raw), 1, 500),
    };
  }
  const numeric = parsePx(raw, fontSize * 1.2);
  return {
    unit: "PIXELS",
    value: Math.max(1, numeric),
  };
}

function parseLetterSpacing(value, fontSize) {
  const raw = String(value || "").trim();
  if (!raw || raw === "normal") {
    return { unit: "PIXELS", value: 0 };
  }
  if (raw.endsWith("%")) {
    return {
      unit: "PERCENT",
      value: clamp(parseFloat(raw), -100, 500),
    };
  }
  const numeric = parsePx(raw, 0);
  return {
    unit: "PIXELS",
    value: clamp(numeric, -fontSize, fontSize * 3),
  };
}

function parseTextAlign(value) {
  const normalized = String(value || "left").toUpperCase();
  if (normalized === "CENTER") return "CENTER";
  if (normalized === "RIGHT") return "RIGHT";
  if (normalized === "JUSTIFY") return "JUSTIFIED";
  if (normalized === "END") return "RIGHT";
  return "LEFT";
}

function parseTextCase(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "uppercase") return "UPPER";
  if (normalized === "lowercase") return "LOWER";
  if (normalized === "capitalize") return "TITLE";
  return "ORIGINAL";
}

function parseTextDecoration(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("underline")) return "UNDERLINE";
  if (normalized.includes("line-through")) return "STRIKETHROUGH";
  return "NONE";
}

function parseBlendMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "normal") return "PASS_THROUGH";

  const blendModes = {
    multiply: "MULTIPLY",
    screen: "SCREEN",
    overlay: "OVERLAY",
    darken: "DARKEN",
    lighten: "LIGHTEN",
    "color-dodge": "COLOR_DODGE",
    "color-burn": "COLOR_BURN",
    "hard-light": "HARD_LIGHT",
    "soft-light": "SOFT_LIGHT",
    difference: "DIFFERENCE",
    exclusion: "EXCLUSION",
    hue: "HUE",
    saturation: "SATURATION",
    color: "COLOR",
    luminosity: "LUMINOSITY",
  };

  return blendModes[normalized] || "PASS_THROUGH";
}

function parseBorderRadius(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => parsePx(part, 0));
  if (parts.length === 0) return { all: 0 };
  if (parts.length === 1) return { all: Math.max(0, parts[0]) };
  if (parts.length >= 4) {
    return {
      topLeft: Math.max(0, parts[0]),
      topRight: Math.max(0, parts[1]),
      bottomRight: Math.max(0, parts[2]),
      bottomLeft: Math.max(0, parts[3]),
    };
  }
  return { all: Math.max(0, parts[0]) };
}

function applyCornerRadius(node, value) {
  const radius = parseBorderRadius(value);
  if ("all" in radius) {
    node.cornerRadius = radius.all;
    return;
  }
  node.topLeftRadius = radius.topLeft;
  node.topRightRadius = radius.topRight;
  node.bottomRightRadius = radius.bottomRight;
  node.bottomLeftRadius = radius.bottomLeft;
}

function parseShadow(input) {
  const raw = String(input || "").trim();
  if (!raw || raw === "none") return [];
  return splitCssList(raw)
    .map((entry) => parseShadowEntry(entry))
    .filter(Boolean);
}

function splitCssList(input) {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of raw) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseShadowEntry(input, forceType) {
  const raw = String(input || "").trim();
  if (!raw || raw === "none") return null;

  const colorMatches = raw.match(/(rgba?\([^)]+\)|#[0-9a-f]{3,8}|color\(srgb\s+[^\)]+\))/ig) || [];
  const colorToken = colorMatches[colorMatches.length - 1] || "rgba(0, 0, 0, 0.18)";
  const color = parseColor(colorToken);
  const cleaned = raw
    .replace(/\binset\b/ig, " ")
    .replace(colorToken, " ")
    .trim();
  const numbers = cleaned.match(/-?\d+(\.\d+)?/g) || [];
  const offsetX = parsePx(numbers[0], 0);
  const offsetY = parsePx(numbers[1], 0);
  const blur = Math.max(0, parsePx(numbers[2], 0));
  const spread = Math.max(0, parsePx(numbers[3], 0));

  if (!color) return null;

  const shadow = {
    type: forceType || (/\binset\b/i.test(raw) ? "INNER_SHADOW" : "DROP_SHADOW"),
    color: {
      r: color.color.r,
      g: color.color.g,
      b: color.color.b,
      a: color.opacity !== undefined ? color.opacity : 1,
    },
    offset: { x: offsetX, y: offsetY },
    radius: blur,
    visible: true,
    blendMode: "NORMAL",
  };
  if (spread > 0) {
    shadow.spread = spread;
  }
  return shadow;
}

function parseFilterEffects(input) {
  const raw = String(input || "").trim();
  if (!raw || raw === "none") return [];

  const effects = [];
  const blurMatches = raw.match(/blur\(([^)]+)\)/ig) || [];
  for (const match of blurMatches) {
    const blur = Math.max(0, parsePx(match.replace(/^blur\(/i, "").replace(/\)$/, ""), 0));
    if (blur > 0) {
      effects.push({
        type: "LAYER_BLUR",
        radius: blur,
        visible: true,
      });
    }
  }

  const dropShadowMatches = raw.match(/drop-shadow\(([^()]|\([^)]*\))+\)/ig) || [];
  for (const match of dropShadowMatches) {
    const shadow = parseShadowEntry(
      match.replace(/^drop-shadow\(/i, "").replace(/\)$/, ""),
      "DROP_SHADOW"
    );
    if (shadow) effects.push(shadow);
  }

  return effects;
}

function parseBackdropEffects(input) {
  const raw = String(input || "").trim();
  if (!raw || raw === "none") return [];

  const effects = [];
  const blurMatches = raw.match(/blur\(([^)]+)\)/ig) || [];
  for (const match of blurMatches) {
    const blur = Math.max(0, parsePx(match.replace(/^blur\(/i, "").replace(/\)$/, ""), 0));
    if (blur > 0) {
      effects.push({
        type: "BACKGROUND_BLUR",
        radius: blur,
        visible: true,
      });
    }
  }
  return effects;
}

function buildEffects(nodeDef) {
  const visual = nodeDef && nodeDef.visual ? nodeDef.visual : {};
  return parseShadow(visual.boxShadow)
    .concat(parseShadow(visual.textShadow))
    .concat(parseFilterEffects(visual.filter))
    .concat(parseBackdropEffects(visual.backdropFilter));
}

function applySharedVisualProps(node, nodeDef) {
  const visual = nodeDef && nodeDef.visual ? nodeDef.visual : {};
  if ("effects" in node) {
    node.effects = buildEffects(nodeDef);
  }
  if ("opacity" in node) {
    node.opacity = clamp(toNumber(visual.opacity, 1), 0, 1);
  }
  if ("blendMode" in node) {
    node.blendMode = parseBlendMode(visual.mixBlendMode);
  }
}

function getTransformSize(nodeDef) {
  const bounds = getBounds(nodeDef);
  const transform = nodeDef && nodeDef.transform ? nodeDef.transform : {};
  return {
    width: Math.max(1, toNumber(transform.layoutWidth, bounds.width)),
    height: Math.max(1, toNumber(transform.layoutHeight, bounds.height)),
  };
}

function normalizeIconName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function isVectorizedMaterialIcon(nodeDef) {
  return Boolean(
    nodeDef
      && nodeDef.image
      && nodeDef.image.kind === "icon-raster"
      && nodeDef.textContent
  );
}

function inferMaterialIconFamily(nodeDef) {
  const typography = nodeDef.typography || {};
  const fontFamily = String(typography.fontFamily || "").toLowerCase();
  const variation = String(typography.fontVariationSettings || "").toLowerCase();
  const fillMatch = variation.match(/['"]fill['"]\s*([0-9.]+)/i);
  const fillValue = fillMatch ? parseFloat(fillMatch[1]) : 1;

  if (fontFamily.includes("sharp")) {
    return "sharp";
  }
  if (fontFamily.includes("rounded")) {
    return fillValue <= 0 ? "round" : "round";
  }
  if (fontFamily.includes("outlined") || fillValue <= 0) {
    return "outline";
  }
  return "baseline";
}

function colorizeSvgMarkup(markup, paint) {
  let next = String(markup || "");
  const hex = svgColorHexFromPaint(paint);
  const opacity = paint && paint.opacity !== undefined ? clamp(paint.opacity, 0, 1) : 1;

  next = next.replace(/\scolor="[^"]*"/gi, "");
  next = next.replace(/fill="(?!none)[^"]*"/gi, `fill="${hex}"`);
  next = next.replace(/stroke="(?!none)[^"]*"/gi, `stroke="${hex}"`);
  next = next.replace(/fill-opacity="[^"]*"/gi, `fill-opacity="${opacity}"`);
  next = next.replace(/stroke-opacity="[^"]*"/gi, `stroke-opacity="${opacity}"`);

  if (!/fill="/i.test(next)) {
    next = next.replace(/<svg\b/i, `<svg fill="${hex}"`);
  }
  if (opacity < 1 && !/fill-opacity="/i.test(next)) {
    next = next.replace(/<svg\b/i, `<svg fill-opacity="${opacity}"`);
  }
  return next;
}

async function fetchMaterialIconSvg(nodeDef) {
  const iconName = normalizeIconName(nodeDef.textContent);
  if (!iconName) return null;
  const family = inferMaterialIconFamily(nodeDef);
  const rawCacheKey = `${family}:${iconName}`;
  let rawSvg = iconSvgCache.get(rawCacheKey);
  if (!rawSvg) {
    const url = `https://cdn.jsdelivr.net/gh/material-icons/material-icons/svg/${iconName}/${family}.svg`;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      rawSvg = await response.text();
      if (!rawSvg.includes("<svg")) return null;
      iconSvgCache.set(rawCacheKey, rawSvg);
    } catch (_error) {
      return null;
    }
  }
  const colorPaint = parseColor(nodeDef.visual && nodeDef.visual.color);
  return colorizeSvgMarkup(rawSvg, colorPaint);
}

function splitFontFamilies(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function fontStyleCandidates(weight, fontStyle) {
  const numericWeight = parseInt(String(weight || "400"), 10);
  const italic = String(fontStyle || "").toLowerCase().includes("italic");
  const candidates = [];

  if (numericWeight >= 800) candidates.push("ExtraBold", "Extra Bold", "Bold");
  else if (numericWeight >= 700) candidates.push("Bold", "SemiBold", "Semi Bold");
  else if (numericWeight >= 600) candidates.push("SemiBold", "Semi Bold", "Medium");
  else if (numericWeight >= 500) candidates.push("Medium", "Regular");
  else candidates.push("Regular");

  const expanded = [];
  for (const candidate of candidates) {
    if (italic) {
      expanded.push(`${candidate} Italic`, `${candidate}Italic`, "Italic");
    }
    expanded.push(candidate);
  }
  expanded.push("Regular");
  return Array.from(new Set(expanded));
}

async function getAvailableFonts() {
  if (!availableFontsPromise) {
    availableFontsPromise = figma.listAvailableFontsAsync();
  }
  return availableFontsPromise;
}

async function loadBestFont(fontFamilyValue, fontWeightValue, fontStyleValue) {
  const families = splitFontFamilies(fontFamilyValue);
  const requested = families[0] || DEFAULT_FONT.family;
  const preferredStyles = fontStyleCandidates(fontWeightValue, fontStyleValue);
  const availableFonts = await getAvailableFonts();
  const candidateFamilies = [requested].concat(families.slice(1), [DEFAULT_FONT.family]);
  for (const family of candidateFamilies) {
    const familyFonts = availableFonts.filter((font) => font.fontName.family === family);
    for (const style of preferredStyles) {
      const exactMatch = familyFonts.find((font) => font.fontName.style === style);
      const fuzzyMatch = familyFonts.find((font) => font.fontName.style.toLowerCase() === style.toLowerCase());
      const chosen = exactMatch || fuzzyMatch;
      if (chosen) {
        await figma.loadFontAsync(chosen.fontName);
        return chosen.fontName;
      }
    }
  }

  await figma.loadFontAsync(DEFAULT_FONT);
  return DEFAULT_FONT;
}

function shouldUseAutoLayout(nodeDef) {
  if (!ENABLE_AUTO_LAYOUT) return false;
  if (!nodeDef || !nodeDef.layout) return false;
  if (nodeDef.layout.safeAutoLayout === true) return true;
  if (nodeDef.layout.safeAutoLayout === false) return false;
  const display = String(nodeDef.layout.display || "").toLowerCase();
  const position = String(nodeDef.layout.position || "").toLowerCase();
  const children = getChildren(nodeDef);
  const hasAbsoluteChildren = children.some((child) => {
    const childPosition = String(child && child.layout && child.layout.position || "").toLowerCase();
    return childPosition === "absolute" || childPosition === "fixed";
  });
  const isSafeDisplay = display === "flex" || display === "inline-flex";
  return isSafeDisplay
    && position !== "absolute"
    && position !== "fixed"
    && !hasAbsoluteChildren
    && children.length >= 2;
}

function getChildren(nodeDef) {
  return Array.isArray(nodeDef.children) ? nodeDef.children : [];
}

function getBounds(nodeDef) {
  const bounds = nodeDef && nodeDef.bounds ? nodeDef.bounds : {};
  return {
    x: toNumber(bounds.x, 0),
    y: toNumber(bounds.y, 0),
    width: Math.max(1, toNumber(bounds.width, 1)),
    height: Math.max(1, toNumber(bounds.height, 1)),
  };
}

function decodeBase64ImageBytes(src) {
  const match = String(src || "").match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!match) return null;

  if (typeof figma.base64Decode === "function") {
    return figma.base64Decode(match[1]);
  }

  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function canUseLayoutPositioning(node, parentIsAutoLayout) {
  if (!parentIsAutoLayout) return false;
  if (!node || !("layoutPositioning" in node)) return false;
  const parent = node.parent;
  return Boolean(parent && "layoutMode" in parent && parent.layoutMode !== "NONE");
}

function getLinearTransformBounds(width, height, matrix, originX, originY) {
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width, y: height },
  ].map((point) => {
    const dx = point.x - originX;
    const dy = point.y - originY;
    return {
      x: matrix.e + originX + matrix.a * dx + matrix.c * dy,
      y: matrix.f + originY + matrix.b * dx + matrix.d * dy,
    };
  });

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (let index = 0; index < corners.length; index += 1) {
    minX = Math.min(minX, corners[index].x);
    minY = Math.min(minY, corners[index].y);
  }

  return {
    minX,
    minY,
  };
}

function applyAdvancedTransform(node, nodeDef, parentBounds) {
  if (!("relativeTransform" in node)) return false;

  const transform = nodeDef && nodeDef.transform ? nodeDef.transform : {};
  const matrix = transform.matrix;
  if (!matrix) return false;

  const bounds = getBounds(nodeDef);
  const size = getTransformSize(nodeDef);
  const relativeX = bounds.x - toNumber(parentBounds && parentBounds.x, 0);
  const relativeY = bounds.y - toNumber(parentBounds && parentBounds.y, 0);
  const originX = toNumber(transform.originX, size.width / 2);
  const originY = toNumber(transform.originY, size.height / 2);
  const localBounds = getLinearTransformBounds(size.width, size.height, matrix, originX, originY);
  const baseTx = toNumber(matrix.e, 0) + originX - matrix.a * originX - matrix.c * originY;
  const baseTy = toNumber(matrix.f, 0) + originY - matrix.b * originX - matrix.d * originY;
  const tx = baseTx + (relativeX - localBounds.minX);
  const ty = baseTy + (relativeY - localBounds.minY);

  try {
    if ("resize" in node && node.type !== "TEXT") {
      node.resize(size.width, size.height);
    }
  } catch (_error) {
    // Ignore resize errors for nodes that manage their own size.
  }

  try {
    node.relativeTransform = [
      [matrix.a, matrix.c, tx],
      [matrix.b, matrix.d, ty],
    ];
    return true;
  } catch (_error) {
    return false;
  }
}

function applyNodePosition(node, nodeDef, parentBounds, parentIsAutoLayout) {
  const bounds = getBounds(nodeDef);
  const transform = nodeDef && nodeDef.transform ? nodeDef.transform : {};
  const transformSize = getTransformSize(nodeDef);
  const relativeX = bounds.x - toNumber(parentBounds && parentBounds.x, 0);
  const relativeY = bounds.y - toNumber(parentBounds && parentBounds.y, 0);
  const centeredX = relativeX + (bounds.width - transformSize.width) / 2;
  const centeredY = relativeY + (bounds.height - transformSize.height) / 2;
  let nextX = relativeX;
  let nextY = relativeY;
  const isVectorIcon = isVectorizedMaterialIcon(nodeDef);
  const layout = nodeDef && nodeDef.layout ? nodeDef.layout : {};
  const position = String(layout.position || "").toLowerCase();
  const advancedTransformApplied = !parentIsAutoLayout && applyAdvancedTransform(node, nodeDef, parentBounds);

  if (transform.rotation !== undefined) {
    nextX = centeredX;
    nextY = centeredY;
  }

  if (node.type === "TEXT" && node.textAutoResize === "WIDTH_AND_HEIGHT") {
    const typography = nodeDef.typography || {};
    const align = String(typography.textAlign || "").toLowerCase();
    if (align === "center") {
      nextX = relativeX + (bounds.width - node.width) / 2;
    } else if (align === "right" || align === "end") {
      nextX = relativeX + (bounds.width - node.width);
    }
    nextY = relativeY + Math.max(0, (bounds.height - node.height) / 2);
  }

  if (!parentIsAutoLayout) {
    if (!advancedTransformApplied) {
      node.x = nextX;
      node.y = nextY;
    }
  } else if (canUseLayoutPositioning(node, parentIsAutoLayout)) {
    node.layoutPositioning = position === "absolute" ? "ABSOLUTE" : "AUTO";
    if (position === "absolute") {
      node.x = nextX;
      node.y = nextY;
    }
  }

  if (isVectorIcon) {
    const typography = nodeDef.typography || {};
    const requestedSize = Math.max(1, parsePx(typography.fontSize, Math.min(bounds.width, bounds.height)));
    const iconSize = Math.min(
      Math.max(1, requestedSize),
      Math.max(1, Math.max(bounds.width, bounds.height))
    );
    const canKeepInline = parentIsAutoLayout
      && position !== "absolute"
      && position !== "fixed"
      && canUseLayoutPositioning(node, parentIsAutoLayout);

    if (canKeepInline) {
      node.layoutPositioning = "AUTO";
      if ("resize" in node) {
        try {
          node.resize(iconSize, iconSize);
        } catch (_error) {
          // Keep intrinsic vector size if resize fails.
        }
      }
      return;
    }

    const centeredX = relativeX + (bounds.width - iconSize) / 2;
    const centeredY = relativeY + (bounds.height - iconSize) / 2;

    if (!parentIsAutoLayout) {
      node.x = centeredX;
      node.y = centeredY;
    } else if (canUseLayoutPositioning(node, parentIsAutoLayout)) {
      node.layoutPositioning = "ABSOLUTE";
      node.x = centeredX;
      node.y = centeredY;
    } else {
      node.x = centeredX;
      node.y = centeredY;
    }

    if ("resize" in node) {
      try {
        node.resize(iconSize, iconSize);
      } catch (_error) {
        // Keep intrinsic vector size if resize fails.
      }
    }
    return;
  }

  if (node.type === "TEXT") {
    if (node.textAutoResize === "HEIGHT") {
      try {
        node.resize(bounds.width, Math.max(1, node.height));
      } catch (_error) {
        // Keep measured text size when resize fails.
      }
    } else if (node.textAutoResize === "NONE") {
      try {
        node.resize(bounds.width, Math.max(1, bounds.height));
      } catch (_error) {
        // Keep measured text size when resize fails.
      }
    }
    return;
  }

  if ("resize" in node) {
    try {
      if (!advancedTransformApplied) {
        node.resize(transformSize.width, transformSize.height);
      }
    } catch (_error) {
      // Some nodes are sized by text/image content first.
    }
  }

  if (!advancedTransformApplied && "rotation" in node && transform.rotation !== undefined) {
    node.rotation = transform.rotation;
  }
}

async function applyGeometry(node, nodeDef) {
  const visual = nodeDef.visual || {};
  const border = nodeDef.border || {};
  const topBorder = border.top || {};
  const rightBorder = border.right || {};
  const bottomBorder = border.bottom || {};
  const leftBorder = border.left || {};
  const outlineColor = parseColor(visual.outlineColor || "");
  const outlineWidth = Math.max(0, toNumber(visual.outlineWidth, 0));
  const topWidth = Math.max(0, toNumber(topBorder.width, 0));
  const rightWidth = Math.max(0, toNumber(rightBorder.width, 0));
  const bottomWidth = Math.max(0, toNumber(bottomBorder.width, 0));
  const leftWidth = Math.max(0, toNumber(leftBorder.width, 0));
  const useOutlineAsStroke = topWidth === 0 && rightWidth === 0 && bottomWidth === 0 && leftWidth === 0 && outlineWidth > 0;
  const strokeColor = parseColor(topBorder.color || rightBorder.color || bottomBorder.color || leftBorder.color || "")
    || (outlineWidth > 0 ? outlineColor : null);
  const appliedTopWidth = useOutlineAsStroke ? outlineWidth : topWidth;
  const appliedRightWidth = useOutlineAsStroke ? outlineWidth : rightWidth;
  const appliedBottomWidth = useOutlineAsStroke ? outlineWidth : bottomWidth;
  const appliedLeftWidth = useOutlineAsStroke ? outlineWidth : leftWidth;
  const strokeWidth = Math.max(topWidth, rightWidth, bottomWidth, leftWidth, outlineWidth);
  const borderStyle = String(
    topBorder.style
    || rightBorder.style
    || bottomBorder.style
    || leftBorder.style
    || visual.outlineStyle
    || ""
  ).toLowerCase();
  const fills = await buildFillPaints(nodeDef);

  if ("fills" in node) {
    node.fills = fills;
  }
  if ("strokes" in node) {
    node.strokes = strokeColor ? [strokeColor] : [];
    node.strokeWeight = strokeWidth;
    if ("strokeTopWeight" in node) node.strokeTopWeight = appliedTopWidth;
    if ("strokeRightWeight" in node) node.strokeRightWeight = appliedRightWidth;
    if ("strokeBottomWeight" in node) node.strokeBottomWeight = appliedBottomWidth;
    if ("strokeLeftWeight" in node) node.strokeLeftWeight = appliedLeftWidth;
    if ("dashPattern" in node) {
      if (borderStyle === "dashed") node.dashPattern = [8, 6];
      else if (borderStyle === "dotted") node.dashPattern = [1, 4];
      else node.dashPattern = [];
    }
  }
  if ("cornerRadius" in node || "topLeftRadius" in node) {
    applyCornerRadius(node, border.radius);
  }
  applySharedVisualProps(node, nodeDef);
}

function applyAutoLayout(frame, nodeDef) {
  const layout = nodeDef.layout || {};
  const overflowClipped = String(layout.overflowX || "").toLowerCase() === "hidden"
    || String(layout.overflowY || "").toLowerCase() === "hidden";
  if (!shouldUseAutoLayout(nodeDef)) {
    frame.layoutMode = "NONE";
    frame.clipsContent = overflowClipped;
    return;
  }

  const flexDirection = String(layout.flexDirection || "column").toLowerCase();
  frame.layoutMode = flexDirection === "row" ? "HORIZONTAL" : "VERTICAL";
  if ("layoutWrap" in frame) {
    frame.layoutWrap = layout.wrap ? "WRAP" : "NO_WRAP";
  }
  frame.itemSpacing = Math.max(0, toNumber(
    flexDirection === "row" ? layout.columnGap : layout.rowGap,
    layout.gap
  ));
  if ("counterAxisSpacing" in frame && layout.wrap) {
    frame.counterAxisSpacing = Math.max(0, toNumber(
      flexDirection === "row" ? layout.rowGap : layout.columnGap,
      layout.gap
    ));
  }
  const padding = layout.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  frame.paddingTop = Math.max(0, toNumber(padding.top, 0));
  frame.paddingRight = Math.max(0, toNumber(padding.right, 0));
  frame.paddingBottom = Math.max(0, toNumber(padding.bottom, 0));
  frame.paddingLeft = Math.max(0, toNumber(padding.left, 0));

  const justify = String(layout.justifyContent || "").toLowerCase();
  if (justify === "center") frame.primaryAxisAlignItems = "CENTER";
  else if (justify === "flex-end" || justify === "end") frame.primaryAxisAlignItems = "MAX";
  else if (justify === "space-between") frame.primaryAxisAlignItems = "SPACE_BETWEEN";
  else frame.primaryAxisAlignItems = "MIN";

  const align = String(layout.alignItems || "").toLowerCase();
  if (align === "center") frame.counterAxisAlignItems = "CENTER";
  else if (align === "flex-end" || align === "end") frame.counterAxisAlignItems = "MAX";
  else frame.counterAxisAlignItems = "MIN";

  const widthMode = String(layout.widthMode || "").toLowerCase();
  const heightMode = String(layout.heightMode || "").toLowerCase();
  const primaryHug = frame.layoutMode === "HORIZONTAL" ? widthMode === "hug" : heightMode === "hug";
  const counterHug = frame.layoutMode === "HORIZONTAL" ? heightMode === "hug" : widthMode === "hug";
  frame.primaryAxisSizingMode = primaryHug ? "AUTO" : "FIXED";
  frame.counterAxisSizingMode = counterHug ? "AUTO" : "FIXED";

  frame.clipsContent = overflowClipped;
}

function sanitizeLayoutAlignValue(value) {
  if (value === "STRETCH") return "STRETCH";
  return "INHERIT";
}

function parseLayoutAlign(value) {
  const normalized = String(value || "").toLowerCase();
  return sanitizeLayoutAlignValue(normalized === "stretch" ? "STRETCH" : "INHERIT");
}

function applyLayoutChildProps(node, nodeDef, parentIsAutoLayout) {
  if (!parentIsAutoLayout || !nodeDef || !nodeDef.layout) return;
  const layout = nodeDef.layout || {};

  if ("layoutGrow" in node) {
    const grow = Math.max(0, toNumber(layout.flexGrow, 0));
    node.layoutGrow = grow;
  }

  if ("layoutAlign" in node) {
    const alignValue = layout.alignSelf || layout.justifySelf || "";
    if (alignValue) {
      node.layoutAlign = parseLayoutAlign(alignValue);
    } else if (toNumber(layout.flexGrow, 0) > 0) {
      node.layoutAlign = "STRETCH";
    }
  }

  if ("minWidth" in node && layout.minWidth !== undefined) {
    node.minWidth = Math.max(0, toNumber(layout.minWidth, 0));
  }
  if ("maxWidth" in node && layout.maxWidth !== undefined) {
    node.maxWidth = Math.max(0, toNumber(layout.maxWidth, 0));
  }
  if ("minHeight" in node && layout.minHeight !== undefined) {
    node.minHeight = Math.max(0, toNumber(layout.minHeight, 0));
  }
  if ("maxHeight" in node && layout.maxHeight !== undefined) {
    node.maxHeight = Math.max(0, toNumber(layout.maxHeight, 0));
  }
}

function parseObjectPosition(value) {
  const raw = String(value || "").trim();
  if (!raw) return { x: 0.5, y: 0.5 };
  const parts = raw.split(/\s+/).filter(Boolean);
  return {
    x: parsePercentOrPx(parts[0], 1, 0.5),
    y: parsePercentOrPx(parts[1] || parts[0], 1, 0.5),
  };
}

function resolveCssLength(value, size, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "left" || raw === "top") return 0;
  if (raw === "center") return fallback;
  if (raw === "right" || raw === "bottom") return size;
  if (raw.endsWith("%")) return clamp(parseFloat(raw) / 100, 0, 1) * size;
  return parsePx(raw, fallback);
}

function parsePointPair(value, width, height) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  return {
    x: resolveCssLength(parts[0], width, width / 2),
    y: resolveCssLength(parts[1] || parts[0], height, height / 2),
  };
}

function buildClipPathSvgMarkup(clipPath, width, height) {
  const raw = String(clipPath || "").trim();
  if (!raw || raw === "none") return null;

  const polygonMatch = raw.match(/^polygon\((.*)\)$/i);
  if (polygonMatch) {
    const points = splitCssList(polygonMatch[1])
      .map((token) => parsePointPair(token, width, height))
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
    if (!points) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polygon points="${points}" fill="black" /></svg>`;
  }

  const circleMatch = raw.match(/^circle\((.*)\)$/i);
  if (circleMatch) {
    const descriptor = circleMatch[1];
    const atMatch = descriptor.match(/^(.*?)\s+at\s+(.+)$/i);
    const radiusToken = atMatch ? atMatch[1].trim() : descriptor.trim();
    const center = parsePointPair(atMatch ? atMatch[2] : "50% 50%", width, height);
    let radius = Math.min(width, height) / 2;
    if (radiusToken.endsWith("%")) {
      radius = (parseFloat(radiusToken) / 100) * Math.min(width, height);
    } else if (radiusToken && !/closest-side|farthest-side/i.test(radiusToken)) {
      radius = parsePx(radiusToken, radius);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><circle cx="${center.x}" cy="${center.y}" r="${radius}" fill="black" /></svg>`;
  }

  const ellipseMatch = raw.match(/^ellipse\((.*)\)$/i);
  if (ellipseMatch) {
    const descriptor = ellipseMatch[1];
    const atMatch = descriptor.match(/^(.*?)\s+at\s+(.+)$/i);
    const radiusTokens = (atMatch ? atMatch[1] : descriptor).trim().split(/\s+/).filter(Boolean);
    const center = parsePointPair(atMatch ? atMatch[2] : "50% 50%", width, height);
    const rx = resolveCssLength(radiusTokens[0], width, width / 2);
    const ry = resolveCssLength(radiusTokens[1] || radiusTokens[0], height, height / 2);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><ellipse cx="${center.x}" cy="${center.y}" rx="${rx}" ry="${ry}" fill="black" /></svg>`;
  }

  const insetMatch = raw.match(/^inset\((.*)\)$/i);
  if (insetMatch) {
    const descriptor = insetMatch[1];
    const [insetPart, roundPart] = descriptor.split(/\s+round\s+/i);
    const inset = parseBoxInsets(insetPart);
    const x = clamp(inset.left, 0, width);
    const y = clamp(inset.top, 0, height);
    const rectWidth = Math.max(0, width - inset.left - inset.right);
    const rectHeight = Math.max(0, height - inset.top - inset.bottom);
    const radius = roundPart ? Math.max(0, parsePx(roundPart.split(/\s+/)[0], 0)) : 0;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}" rx="${radius}" ry="${radius}" fill="black" /></svg>`;
  }

  return null;
}

function needsMaskWrapper(nodeDef) {
  const visual = nodeDef && nodeDef.visual ? nodeDef.visual : {};
  return Boolean(
    (visual.clipPath && visual.clipPath !== "none")
    || (visual.maskImage && visual.maskImage !== "none")
  );
}

async function createMaskNode(nodeDef) {
  const visual = nodeDef && nodeDef.visual ? nodeDef.visual : {};
  const bounds = getBounds(nodeDef);

  if (visual.maskImage) {
    const fills = await parseBackgroundImageFills(visual.maskImage, bounds.width, bounds.height, {
      backgroundSize: visual.maskSize,
      backgroundPosition: visual.maskPosition,
      backgroundRepeat: visual.maskRepeat,
    });
    if (fills.length > 0) {
      const rect = figma.createRectangle();
      rect.resize(bounds.width, bounds.height);
      rect.fills = fills;
      rect.strokes = [];
      rect.isMask = true;
      return rect;
    }
  }

  if (visual.clipPath) {
    const markup = buildClipPathSvgMarkup(visual.clipPath, bounds.width, bounds.height);
    if (markup) {
      const node = figma.createNodeFromSvg(markup);
      node.isMask = true;
      return node;
    }
  }

  return null;
}

function createMaskWrapper(nodeDef) {
  const bounds = getBounds(nodeDef);
  const wrapper = figma.createFrame();
  wrapper.name = `${String(nodeDef.name || nodeDef.tagName || "Masked")}:mask`;
  wrapper.resize(bounds.width, bounds.height);
  wrapper.fills = [];
  wrapper.strokes = [];
  wrapper.effects = [];
  wrapper.layoutMode = "NONE";
  wrapper.clipsContent = false;
  return wrapper;
}

async function createImageNode(nodeDef) {
  if (nodeDef.image && nodeDef.image.kind === "icon-raster" && nodeDef.textContent) {
    const iconSvg = await fetchMaterialIconSvg(nodeDef);
    if (iconSvg) {
      const iconNode = figma.createNodeFromSvg(iconSvg);
      iconNode.name = String(nodeDef.name || nodeDef.textContent || "Icon");
      return iconNode;
    }
  }

  const rect = figma.createRectangle();
  await applyGeometry(rect, nodeDef);
  const bounds = getBounds(nodeDef);
  rect.resize(bounds.width, bounds.height);

  const image = nodeDef.image || {};
  const visual = nodeDef.visual || {};
  const src = String(image.src || "").trim();
  if (!src) {
    return rect;
  }

  try {
    let figmaImage;
    const base64Bytes = decodeBase64ImageBytes(src);
    if (base64Bytes) {
      figmaImage = figma.createImage(base64Bytes);
    } else {
      figmaImage = await figma.createImageAsync(src);
    }
    const objectFit = String(visual.objectFit || "").trim().toLowerCase();
    const objectPosition = parseObjectPosition(visual.objectPosition);
    let scaleMode = "FILL";
    if (objectFit === "contain" || objectFit === "scale-down") {
      scaleMode = "FIT";
    } else if (objectFit === "none") {
      scaleMode = "CROP";
    }
    rect.fills = [
      {
        type: "IMAGE",
        imageHash: figmaImage.hash,
        scaleMode,
        imageTransform: scaleMode === "CROP"
          ? [
              [1, 0, clamp(objectPosition.x - 0.5, -1, 1)],
              [0, 1, clamp(objectPosition.y - 0.5, -1, 1)],
            ]
          : undefined,
      },
    ];
  } catch (_error) {
    rect.fills = [solidPaint({ r: 0.92, g: 0.93, b: 0.95 })];
    rect.strokes = [solidPaint({ r: 0.82, g: 0.84, b: 0.88 })];
  }

  return rect;
}

async function createSvgNode(nodeDef) {
  const svgDef = nodeDef.svg || {};
  const markup = String(svgDef.markup || "").trim();
  if (!markup) {
    return createFrameNode(nodeDef);
  }

  const imported = figma.createNodeFromSvg(markup);
  imported.name = String(nodeDef.name || nodeDef.tagName || "SVG");
  applySharedVisualProps(imported, nodeDef);
  return imported;
}

async function createTextNode(nodeDef) {
  const textNode = figma.createText();
  const typography = nodeDef.typography || {};
  const textMetrics = nodeDef.textMetrics || {};
  const bounds = getBounds(nodeDef);
  const fontSize = Math.max(1, parsePx(typography.fontSize, 16));
  const fontName = await loadBestFont(typography.fontFamily, typography.fontWeight, typography.fontStyle);
  const whiteSpace = String(typography.whiteSpace || "").toLowerCase();
  const isSingleLine = toNumber(textMetrics.lineCount, 1) <= 1;

  textNode.fontName = fontName;
  textNode.characters = String(nodeDef.textContent || "");
  textNode.fontSize = fontSize;
  textNode.lineHeight = parseLineHeight(typography.lineHeight, fontSize);
  textNode.letterSpacing = parseLetterSpacing(typography.letterSpacing, fontSize);
  textNode.textAlignHorizontal = parseTextAlign(typography.textAlign);
  textNode.textCase = parseTextCase(typography.textTransform);
  textNode.textDecoration = parseTextDecoration(typography.textDecoration);
  if (whiteSpace.includes("nowrap") || isSingleLine) {
    textNode.textAutoResize = "WIDTH_AND_HEIGHT";
  } else {
    textNode.textAutoResize = "HEIGHT";
    textNode.resize(bounds.width, Math.max(1, bounds.height));
  }

  const color = parseColor(nodeDef.visual && nodeDef.visual.color);
  textNode.fills = color ? [color] : [solidPaint({ r: 0.07, g: 0.09, b: 0.12 })];
  applySharedVisualProps(textNode, nodeDef);

  return textNode;
}

async function createFrameNode(nodeDef) {
  const frame = figma.createFrame();
  frame.name = String(nodeDef.name || nodeDef.tagName || "Frame");
  const bounds = getBounds(nodeDef);
  frame.resize(bounds.width, bounds.height);
  frame.clipsContent = false;
  await applyGeometry(frame, nodeDef);
  applyAutoLayout(frame, nodeDef);
  return frame;
}

async function instantiateNode(nodeDef, parent, parentBounds, parentIsAutoLayout, context) {
  const nodeType = String(nodeDef.nodeType || "frame");
  let node;

  if (nodeType === "text") {
    node = await createTextNode(nodeDef);
  } else if (nodeType === "image") {
    node = await createImageNode(nodeDef);
  } else if (nodeType === "svg") {
    node = await createSvgNode(nodeDef);
  } else {
    node = await createFrameNode(nodeDef);
  }

  node.name = String(nodeDef.name || nodeDef.tagName || nodeType);
  let positionedNode = node;
  let returnedNode = node;

  if (needsMaskWrapper(nodeDef)) {
    const maskNode = await createMaskNode(nodeDef);
    if (maskNode) {
      const wrapper = createMaskWrapper(nodeDef);
      parent.appendChild(wrapper);
      applyNodePosition(wrapper, nodeDef, parentBounds, parentIsAutoLayout);
      applyLayoutChildProps(wrapper, nodeDef, parentIsAutoLayout);
      wrapper.appendChild(maskNode);
      if ("x" in maskNode) maskNode.x = 0;
      if ("y" in maskNode) maskNode.y = 0;
      returnedNode = wrapper;
      wrapper.appendChild(node);
      applyNodePosition(node, nodeDef, getBounds(nodeDef), false);
      positionedNode = node;
    } else {
      parent.appendChild(node);
      applyNodePosition(node, nodeDef, parentBounds, parentIsAutoLayout);
      applyLayoutChildProps(node, nodeDef, parentIsAutoLayout);
    }
  } else {
    parent.appendChild(node);
    applyNodePosition(node, nodeDef, parentBounds, parentIsAutoLayout);
    applyLayoutChildProps(node, nodeDef, parentIsAutoLayout);
  }

  context.nodeRecords.push({
    nodeDef,
    node: returnedNode,
  });

  if ("children" in node && Array.isArray(nodeDef.children) && nodeDef.children.length > 0) {
    const isAutoLayout = node.type === "FRAME" && node.layoutMode !== "NONE";
    const nodeBounds = getBounds(nodeDef);
    for (const childDef of nodeDef.children) {
      await instantiateNode(childDef, positionedNode, nodeBounds, isAutoLayout, context);
    }
  }

  return returnedNode;
}

function arrangeScreens(frames) {
  let cursorX = figma.viewport.center.x - 200;
  const startY = figma.viewport.center.y - 200;

  for (const frame of frames) {
    frame.x = cursorX;
    frame.y = startY;
    cursorX += frame.width + 120;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateSceneNode(node, path) {
  if (!isPlainObject(node)) {
    throw new Error(`${path} is not a valid scene node.`);
  }

  const nodeType = String(node.nodeType || "");
  if (!["screen", "frame", "text", "image", "svg"].includes(nodeType)) {
    throw new Error(`${path}.nodeType is not supported.`);
  }
  if (!isPlainObject(node.bounds)) {
    throw new Error(`${path}.bounds is required.`);
  }
  if (!isPlainObject(node.layout)) {
    throw new Error(`${path}.layout is required.`);
  }
  if (!isPlainObject(node.border)) {
    throw new Error(`${path}.border is required.`);
  }
  if (!isPlainObject(node.visual)) {
    throw new Error(`${path}.visual is required.`);
  }

  const bounds = getBounds(node);
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error(`${path}.bounds must describe a positive size.`);
  }

  if (nodeType === "text" && typeof node.textContent !== "string") {
    throw new Error(`${path}.textContent is required for text nodes.`);
  }
  if (nodeType === "image" && (!node.image || typeof node.image !== "object")) {
    throw new Error(`${path}.image is required for image nodes.`);
  }
  if (nodeType === "svg" && (!node.svg || typeof node.svg !== "object")) {
    throw new Error(`${path}.svg is required for svg nodes.`);
  }

  const children = getChildren(node);
  for (let index = 0; index < children.length; index += 1) {
    validateSceneNode(children[index], `${path}.children[${index}]`);
  }
}

function normalizeImportSettings(input) {
  return {
    createVariables: input && input.createVariables !== false,
    createStyles: input && input.createStyles !== false,
    createComponents: input && input.createComponents !== false,
  };
}

function sanitizeImportName(input, fallback = "Asset") {
  const normalized = String(input || "")
    .replace(/[^\w\s/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildComponentSignature(nodeDef) {
  const children = getChildren(nodeDef).map((child) => buildComponentSignature(child));
  return stableStringify({
    nodeType: nodeDef.nodeType,
    tagName: nodeDef.tagName,
    name: sanitizeImportName(nodeDef.name, nodeDef.tagName || "Node"),
    bounds: {
      width: getBounds(nodeDef).width,
      height: getBounds(nodeDef).height,
    },
    layout: nodeDef.layout || {},
    border: nodeDef.border || {},
    visual: nodeDef.visual || {},
    typography: nodeDef.typography || null,
    textContent: nodeDef.textContent || null,
    image: nodeDef.image ? {
      kind: nodeDef.image.kind || "",
      src: String(nodeDef.image.src || "").slice(0, 256),
    } : null,
    svg: nodeDef.svg ? {
      kind: nodeDef.svg.kind || "",
      markup: String(nodeDef.svg.markup || "").slice(0, 256),
    } : null,
    children,
  });
}

function snapshotNodePlacement(node) {
  const snapshot = {
    parent: node.parent || null,
    width: "width" in node ? node.width : null,
    height: "height" in node ? node.height : null,
    x: "x" in node ? node.x : null,
    y: "y" in node ? node.y : null,
    rotation: "rotation" in node ? node.rotation : null,
    layoutPositioning: "layoutPositioning" in node ? node.layoutPositioning : null,
    layoutGrow: "layoutGrow" in node ? node.layoutGrow : null,
    layoutAlign: "layoutAlign" in node ? node.layoutAlign : null,
  };
  if ("minWidth" in node) snapshot.minWidth = node.minWidth;
  if ("maxWidth" in node) snapshot.maxWidth = node.maxWidth;
  if ("minHeight" in node) snapshot.minHeight = node.minHeight;
  if ("maxHeight" in node) snapshot.maxHeight = node.maxHeight;
  return snapshot;
}

function applyPlacementSnapshot(node, snapshot) {
  const parent = snapshot.parent;
  if (!parent || !("appendChild" in parent)) {
    return node;
  }
  parent.appendChild(node);
  if ("layoutPositioning" in node && snapshot.layoutPositioning) {
    node.layoutPositioning = snapshot.layoutPositioning;
  }
  if ("layoutGrow" in node && snapshot.layoutGrow !== null) {
    node.layoutGrow = snapshot.layoutGrow;
  }
  if ("layoutAlign" in node && snapshot.layoutAlign) {
    node.layoutAlign = sanitizeLayoutAlignValue(snapshot.layoutAlign);
  }
  if ("minWidth" in node && snapshot.minWidth !== undefined) {
    node.minWidth = snapshot.minWidth;
  }
  if ("maxWidth" in node && snapshot.maxWidth !== undefined) {
    node.maxWidth = snapshot.maxWidth;
  }
  if ("minHeight" in node && snapshot.minHeight !== undefined) {
    node.minHeight = snapshot.minHeight;
  }
  if ("maxHeight" in node && snapshot.maxHeight !== undefined) {
    node.maxHeight = snapshot.maxHeight;
  }
  if (snapshot.layoutPositioning === "ABSOLUTE" || !("layoutPositioning" in node)) {
    if ("x" in node && snapshot.x !== null) node.x = snapshot.x;
    if ("y" in node && snapshot.y !== null) node.y = snapshot.y;
  }
  if ("rotation" in node && snapshot.rotation !== null) {
    node.rotation = snapshot.rotation;
  }
  if ("resize" in node && snapshot.width !== null && snapshot.height !== null) {
    try {
      node.resize(snapshot.width, snapshot.height);
    } catch (_error) {
      // Instance sizing can be constrained by component internals.
    }
  }
  return node;
}

function getOrCreateImportAssetsFrame(page) {
  const existing = page.children.find((node) => node.type === "FRAME" && node.name === `${IMPORT_ASSET_PREFIX} Assets`);
  if (existing) {
    return existing;
  }
  const frame = figma.createFrame();
  frame.name = `${IMPORT_ASSET_PREFIX} Assets`;
  frame.resize(1600, 1600);
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.itemSpacing = 32;
  frame.paddingTop = 32;
  frame.paddingRight = 32;
  frame.paddingBottom = 32;
  frame.paddingLeft = 32;
  frame.fills = [solidPaint({ r: 0.97, g: 0.97, b: 0.98 })];
  frame.x = 0;
  frame.y = 2000;
  page.appendChild(frame);
  return frame;
}

async function createColorVariable(collection, modeId, name, value, alternateModeId, alternateValue) {
  const variable = figma.variables.createVariable(name, collection, "COLOR");
  variable.setValueForMode(modeId, value);
  if (alternateModeId && alternateValue) {
    variable.setValueForMode(alternateModeId, alternateValue);
  }
  return variable;
}

function parseColorForVariable(input) {
  const color = parseColor(input);
  if (!color) return null;
  return {
    r: color.color.r,
    g: color.color.g,
    b: color.color.b,
    a: color.opacity !== undefined ? color.opacity : 1,
  };
}

async function createDesignSystemAssets(payload, settings) {
  const designSystem = payload && payload.designSystem;
  const summary = { variables: 0, styles: 0 };
  if (!designSystem) {
    return summary;
  }

  if (settings.createVariables && figma.variables && typeof figma.variables.createVariableCollection === "function") {
    const collection = figma.variables.createVariableCollection(`${IMPORT_ASSET_PREFIX} Tokens`);
    const defaultModeId = collection.modes[0].modeId;
    let darkModeId = null;
    if (designSystem.tokenModes && collection.addMode) {
      try {
        darkModeId = collection.addMode("Dark");
      } catch (_error) {
        darkModeId = null;
      }
    }

    const tokenEntries = Object.entries(designSystem.tokens || {});
    for (const [name, value] of tokenEntries) {
      const lightTokenValue = designSystem.tokenModes
        && designSystem.tokenModes.light
        && designSystem.tokenModes.light[name]
        ? designSystem.tokenModes.light[name]
        : value;
      const darkTokenValue = designSystem.tokenModes
        && designSystem.tokenModes.dark
        && designSystem.tokenModes.dark[name]
        ? designSystem.tokenModes.dark[name]
        : value;
      const lightValue = parseColorForVariable(lightTokenValue);
      const darkValue = parseColorForVariable(darkTokenValue);
      if (!lightValue) continue;
      await createColorVariable(collection, defaultModeId, `color/${name}`, lightValue, darkModeId, darkValue);
      summary.variables += 1;
    }

    const floatEntries = [
      ["spacing/baseUnit", Number(designSystem.spacing && designSystem.spacing.baseUnit)],
      ["motion/durationFastMs", Number(designSystem.motion && designSystem.motion.durationFastMs)],
      ["motion/durationBaseMs", Number(designSystem.motion && designSystem.motion.durationBaseMs)],
      ["radius/card", parsePx(designSystem.radius && designSystem.radius.card, 0)],
      ["radius/control", parsePx(designSystem.radius && designSystem.radius.control, 0)],
      ["radius/pill", parsePx(designSystem.radius && designSystem.radius.pill, 0)],
    ];
    for (const [name, value] of floatEntries) {
      if (!Number.isFinite(value)) continue;
      const variable = figma.variables.createVariable(name, collection, "FLOAT");
      variable.setValueForMode(defaultModeId, value);
      summary.variables += 1;
    }
  }

  if (settings.createStyles) {
    for (const [name, value] of Object.entries(designSystem.tokens || {})) {
      const paint = parseColor(value);
      if (!paint) continue;
      const style = figma.createPaintStyle();
      style.name = `${IMPORT_ASSET_PREFIX}/Color/${sanitizeImportName(name, "token")}`;
      style.paints = [paint];
      summary.styles += 1;
    }

    const textScale = designSystem.typography && designSystem.typography.scale ? designSystem.typography.scale : {};
    const textSpecs = [
      ["Display", designSystem.typography && designSystem.typography.displayFont, textScale.display],
      ["H1", designSystem.typography && designSystem.typography.displayFont, textScale.h1],
      ["H2", designSystem.typography && designSystem.typography.displayFont, textScale.h2],
      ["Body", designSystem.typography && designSystem.typography.bodyFont, textScale.body],
      ["Caption", designSystem.typography && designSystem.typography.bodyFont, textScale.caption],
    ];
    for (const [label, family, size] of textSpecs) {
      const fontSize = parsePx(size, 0);
      if (!fontSize) continue;
      const style = figma.createTextStyle();
      style.name = `${IMPORT_ASSET_PREFIX}/Typography/${label}`;
      style.fontName = await loadBestFont(family, "400", "normal");
      style.fontSize = fontSize;
      summary.styles += 1;
    }

    const shadowEntries = [
      ["Soft", designSystem.shadows && designSystem.shadows.soft],
      ["Glow", designSystem.shadows && designSystem.shadows.glow],
    ];
    for (const [label, value] of shadowEntries) {
      const effects = parseShadow(value);
      if (effects.length === 0) continue;
      const style = figma.createEffectStyle();
      style.name = `${IMPORT_ASSET_PREFIX}/Effect/${label}`;
      style.effects = effects;
      summary.styles += 1;
    }
  }

  return summary;
}

function promoteRepeatedNodesToComponents(context) {
  if (!context.settings.createComponents || typeof figma.createComponentFromNode !== "function") {
    return 0;
  }

  const groups = new Map();
  for (const record of context.nodeRecords) {
    if (!record || !record.node || record.node.removed) continue;
    if (record.node.type !== "FRAME") continue;
    if (record.nodeDef.nodeType !== "frame") continue;
    if (getChildren(record.nodeDef).length === 0) continue;
    const signature = buildComponentSignature(record.nodeDef);
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(record);
  }

  let componentCount = 0;
  const assetsFrame = getOrCreateImportAssetsFrame(figma.currentPage);

  for (const records of groups.values()) {
    if (!records || records.length < 2) continue;
    const masterRecord = records[0];
    if (!masterRecord.node || masterRecord.node.removed || !masterRecord.node.parent) continue;

    let component;
    try {
      component = figma.createComponentFromNode(masterRecord.node);
    } catch (_error) {
      continue;
    }

    component.name = `${IMPORT_ASSET_PREFIX}/Component/${sanitizeImportName(masterRecord.node.name, "Component")}`;
    const masterSnapshot = snapshotNodePlacement(component);
    const masterInstance = component.createInstance();
    applyPlacementSnapshot(masterInstance, masterSnapshot);
    assetsFrame.appendChild(component);
    component.x = 0;
    component.y = Math.max(0, assetsFrame.children.length - 1) * (component.height + 32);

    for (let index = 1; index < records.length; index += 1) {
      const record = records[index];
      if (!record.node || record.node.removed || !record.node.parent) continue;
      const snapshot = snapshotNodePlacement(record.node);
      const instance = component.createInstance();
      applyPlacementSnapshot(instance, snapshot);
      record.node.remove();
      record.node = instance;
    }

    componentCount += 1;
  }

  return componentCount;
}

function validatePayload(payload) {
  if (!payload || payload.format !== "eazyui.figma-scene") {
    throw new Error("Clipboard data is not an EazyUI Figma payload.");
  }
  if (![1, 2].includes(toNumber(payload.version, 0))) {
    throw new Error("Payload version is not supported by this plugin.");
  }
  if (!payload.generatedAt || Number.isNaN(Date.parse(String(payload.generatedAt)))) {
    throw new Error("Payload generatedAt must be a valid ISO timestamp.");
  }
  if (!Array.isArray(payload.notes)) {
    throw new Error("Payload notes must be an array.");
  }
  if (!Array.isArray(payload.screens) || payload.screens.length === 0) {
    throw new Error("Payload does not contain any screens.");
  }
  payload.screens.forEach((screen, index) => {
    if (!isPlainObject(screen)) {
      throw new Error(`screens[${index}] is not a valid screen.`);
    }
    if (!screen.root) {
      throw new Error(`screens[${index}].root is required.`);
    }
    validateSceneNode(screen.root, `screens[${index}].root`);
  });
}

async function createRootContentContainer(screenFrame, rootDef) {
  if (!needsMaskWrapper(rootDef)) {
    applyAutoLayout(screenFrame, rootDef);
    return screenFrame;
  }

  const wrapper = createMaskWrapper(rootDef);
  wrapper.name = `${screenFrame.name}:root-mask`;
  wrapper.resize(screenFrame.width, screenFrame.height);
  screenFrame.appendChild(wrapper);
  wrapper.x = 0;
  wrapper.y = 0;

  const maskNode = await createMaskNode(rootDef);
  if (maskNode) {
    wrapper.appendChild(maskNode);
    if ("x" in maskNode) maskNode.x = 0;
    if ("y" in maskNode) maskNode.y = 0;
  }

  const content = figma.createFrame();
  content.name = `${screenFrame.name}:content`;
  content.resize(screenFrame.width, screenFrame.height);
  content.fills = [];
  content.strokes = [];
  content.effects = [];
  content.layoutMode = "NONE";
  content.clipsContent = false;
  applyAutoLayout(content, rootDef);
  wrapper.appendChild(content);
  content.x = 0;
  content.y = 0;
  return content;
}

async function importPayload(payload, importSettings) {
  validatePayload(payload);
  const settings = normalizeImportSettings(importSettings);
  const designSystemSummary = await createDesignSystemAssets(payload, settings);
  const context = {
    settings,
    nodeRecords: [],
  };

  const createdFrames = [];
  for (const screen of payload.screens) {
    const rootDef = screen.root || {};
    const rootBounds = rootDef.bounds || { x: 0, y: 0, width: screen.width, height: screen.height };
    const screenFrame = figma.createFrame();
    screenFrame.name = String(screen.name || "Screen");
    screenFrame.resize(Math.max(1, toNumber(screen.width, 390)), Math.max(1, toNumber(screen.height, 844)));
    screenFrame.fills = [];
    screenFrame.clipsContent = true;
    screenFrame.layoutMode = "NONE";
    await applyGeometry(screenFrame, rootDef);
    const contentParent = await createRootContentContainer(screenFrame, rootDef);

    for (const child of getChildren(rootDef)) {
      await instantiateNode(child, contentParent, rootBounds, contentParent.layoutMode !== "NONE", context);
    }

    figma.currentPage.appendChild(screenFrame);
    createdFrames.push(screenFrame);
  }

  const componentCount = promoteRepeatedNodesToComponents(context);

  arrangeScreens(createdFrames);
  figma.currentPage.selection = createdFrames;
  figma.viewport.scrollAndZoomIntoView(createdFrames);

  return {
    count: createdFrames.length,
    assets: {
      variables: designSystemSummary.variables,
      styles: designSystemSummary.styles,
      components: componentCount,
    },
  };
}

figma.ui.onmessage = async (message) => {
  try {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "cancel") {
      figma.closePlugin();
      return;
    }

    if (message.type === "import-payload") {
      const result = await importPayload(message.payload, message.settings);
      figma.ui.postMessage({
        type: "import-complete",
        count: result.count,
        assets: result.assets,
      });
      figma.notify(
        `Imported ${result.count} screen${result.count === 1 ? "" : "s"} from EazyUI.`
      );
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Import failed.";
    figma.ui.postMessage({
      type: "import-error",
      message: messageText,
    });
    figma.notify(messageText, { error: true });
  }
};
