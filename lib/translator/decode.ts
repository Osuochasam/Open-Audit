/**
 * Hex decoding utilities for Soroban event data.
 *
 * Soroban events encode their topics and data as XDR (External Data Representation).
 * These helpers provide simplified decoding for common patterns.
 */

import type { DecodedAddress, DecodedAmount } from "./types";

const STROOP_DIVISOR = BigInt(10_000_000);

/**
 * Validates that a string is a valid hex string (optionally with 0x prefix).
 * Returns true if valid, false otherwise.
 */
export function isValidHex(hex: string): boolean {
  if (typeof hex !== "string") return false;
  const cleanHex = hex.toLowerCase().replace(/^0x/, "");
  return /^[0-9a-f]+$/.test(cleanHex);
}

/**
 * Sanitizes a hex string by ensuring it only contains valid hex characters.
 * Returns the sanitized hex string or an empty string if invalid.
 */
export function sanitizeHex(hex: string): string {
  if (typeof hex !== "string") return "";
  const cleanHex = hex.toLowerCase().replace(/^0x/, "");
  const sanitized = cleanHex.replace(/[^0-9a-f]/g, "");
  return sanitized.length > 0 ? `0x${sanitized}` : "";
}

/**
 * Escapes HTML entities in a string to prevent XSS attacks.
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
  };
  return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Shortens a Stellar public key for display.
 * e.g. "GABC...WXYZ1234" → "GABC...1234"
 */
export function shortenAddress(publicKey: string): string {
  if (publicKey.length <= 12) return publicKey;
  return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
}

/**
 * Decodes a mock hex-encoded Stellar address.
 * In production this would use stellar-sdk XDR decoding.
 */
export function decodeAddress(hex: string): DecodedAddress {
  // Validate and sanitize hex input
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return {
      publicKey: "GINVALID",
      short: "GINVALID",
    };
  }

  // Mock: derive a deterministic G-address from the hex for demo purposes.
  // Production: use StellarSdk.xdr.ScVal.fromXDR(hex, 'hex') and extract the address.
  const seed = sanitizedHex.slice(2, 10).toUpperCase();
  const tail = sanitizedHex.slice(-4).toUpperCase();
  const publicKey = `G${seed}${"A".repeat(48 - seed.length)}${tail}`;

  return {
    publicKey,
    short: shortenAddress(publicKey),
  };
}

/**
 * Decodes a mock hex-encoded i128 amount (in stroops) to a human-readable value.
 * In production this would use stellar-sdk XDR decoding.
 */
export function decodeAmount(hex: string, symbol: string = "XLM"): DecodedAmount {
  // Validate and sanitize hex input
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return {
      raw: BigInt(0),
      formatted: "0.00",
      symbol,
    };
  }

  // Mock: derive a deterministic amount from the hex for demo purposes.
  // Production: use StellarSdk.xdr.ScVal.fromXDR(hex, 'hex') and extract the i128.
  const hexValue = sanitizedHex.slice(2, 18);
  const rawValue = BigInt("0x" + hexValue || "0");
  const formatted = (Number(rawValue) / Number(STROOP_DIVISOR)).toFixed(2);

  return {
    raw: rawValue,
    formatted,
    symbol,
  };
}

/**
 * Extracts the event name from the first topic hex string.
 * Soroban encodes event names as Symbol XDR values.
 * In production this would decode the XDR Symbol type.
 */
export function decodeEventName(topicHex: string): string {
  // Validate and sanitize hex input
  const sanitizedHex = sanitizeHex(topicHex);
  if (!sanitizedHex) {
    return "unknown";
  }

  // Mock: map known topic hashes to event names for demo purposes.
  const knownTopics: Record<string, string> = {
    "0x0000000000000000000000000000000000000000000000000000000074726e73":
      "transfer",
    "0x000000000000000000000000000000000000000000000000000000006d696e74":
      "mint",
    "0x000000000000000000000000000000000000000000000000000000006275726e":
      "burn",
    "0x000000000000000000000000000000000000000000000000000000006170707276":
      "approve",
  };

  return knownTopics[sanitizedHex] ?? "unknown";
}

/**
 * Formats a Unix timestamp into a human-readable relative time string.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Truncates a hex string for display, showing start and end.
 * e.g. "0x000000...FFFF"
 */
export function truncateHex(hex: string, chars: number = 8): string {
  // Validate and sanitize hex input
  const sanitizedHex = sanitizeHex(hex);
  if (!sanitizedHex) {
    return "0xinvalid";
  }

  if (sanitizedHex.length <= chars * 2 + 2) return sanitizedHex;
  return `${sanitizedHex.slice(0, chars + 2)}...${sanitizedHex.slice(-chars)}`;
}
